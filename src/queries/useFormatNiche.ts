import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { fetchFormatContexts, colorKey } from './formatContexts'
import { normalizeRarity, sortColorsWUBRG } from '../utils/helpers'

/**
 * "Niche cards" of a format = commons/uncommons that are secretly a two-colour
 * card: they over-perform alongside one specific colour and fall back to
 * ordinary without it. The opposite of FLEX.
 *
 * As for FLEX, the per-archetype measure is the DELTA vs the host archetype's
 * win rate (cardWR_in_archetype − archetypeWR), so a strong archetype doesn't
 * make every card look good in it. Contexts need MIN_GAMES games in hand, and
 * every average below is weighted by the card's games in each context: that is
 * where it actually gets played, and where its WR is reliable.
 *
 * MONO-COLOUR cards — partner colour. For each other colour X, the card's
 * 2- and 3-colour contexts that contain its own colour are split in two:
 *   with X    = contexts containing X (the pair + the trios around it)
 *   without X = the others
 *   gap(X)    = mean delta with X − mean delta without X
 * The best X is the partner; the badge shows the pair (card colour + X). Trios
 * are what tell "wants blue" (good in UG, UBG, WUG…) apart from a one-pair
 * fluke, and from a card that is simply good in every 3-colour deck.
 *
 * COLOURLESS cards — no colour of their own to anchor on, so we compare
 * archetypes directly, on the 2-colour pairs only:
 *   home pair = the pair with the highest delta
 *   gap       = home delta − mean delta of the other pairs
 * Lands are left out: colourless as cards, but the dual lands are bicolour by
 * design and would fill the list.
 *
 * A card is a niche card when:
 *   1. it is a Common or Uncommon, mono-colour or colourless (non-land),
 *   2. it has a delta in at least MIN_PAIRS 2-colour pairs (of its colour),
 *   3. its delta with the partner / in the home pair is at least
 *      MIN_HOME_DELTA — it genuinely over-performs there, rather than being bad
 *      everywhere and only "less bad" in one place,
 *   4. its gap is at least MIN_GAP points.
 * Sorted by gap, largest first.
 *
 * Draft formats only: in Sealed the per-context sample is far too small for a
 * few-point gap to mean anything.
 */

// Minimum games in hand per archetype context for its WR to count.
const MIN_GAMES = 500
// At least three 2-colour pairs, so the gap compares against something.
const MIN_PAIRS = 3
// Gap in WR points. Calibrated on FRA/HOB: trios dilute one-pair flukes, so the
// pair-only threshold of 4 drops to 3.5.
const MIN_GAP = 3.5
// Minimum delta with the partner / in the home pair, in WR points. Keeps out
// cards whose gap comes from being bad elsewhere (e.g. +0.2 vs −4.2).
const MIN_HOME_DELTA = 1

export interface NicheInfo {
  /** Home pair, sorted colour key as in card_stats contexts (e.g. "GU"). */
  home: string
  /** Partner colour of a mono-colour card; null for a colourless card. */
  partner: string | null
  /** Mean delta with the partner (mono) or in the home pair (colourless). */
  homeDelta: number
  /** Mean delta without the partner (mono) or in the other pairs (colourless). */
  othersDelta: number
  /** Number of archetype contexts behind homeDelta. */
  homeContexts: number
  /** homeDelta − othersDelta. */
  gap: number
}

export interface FormatNicheResult {
  nicheByName: Record<string, NicheInfo>
}

const EMPTY: FormatNicheResult = { nicheByName: {} }

interface Ctx { key: string; delta: number; games: number }

// Games-weighted mean delta of a set of contexts.
const meanDelta = (ctxs: Ctx[]) =>
  ctxs.reduce((s, c) => s + c.delta * c.games, 0) / ctxs.reduce((s, c) => s + c.games, 0)

/** Mono-colour card: best partner colour, trios included. */
function partnerColour(colour: string, contexts: Ctx[]): NicheInfo | null {
  const own = contexts.filter(c => c.key.includes(colour))
  if (own.filter(c => c.key.length === 2).length < MIN_PAIRS) return null

  let best: NicheInfo | null = null
  for (const x of 'WUBRG') {
    if (x === colour) continue
    const pair = colorKey(colour + x)
    const withX = own.filter(c => c.key.includes(x))
    const withoutX = own.filter(c => !c.key.includes(x))
    // The pair itself must be measured: trios alone don't make a partner.
    if (!withX.some(c => c.key === pair) || withoutX.length === 0) continue

    const homeDelta = meanDelta(withX)
    const othersDelta = meanDelta(withoutX)
    const gap = homeDelta - othersDelta
    if (!best || gap > best.gap) {
      best = { home: pair, partner: x, homeDelta, othersDelta, homeContexts: withX.length, gap }
    }
  }
  return best
}

/** Colourless card: best 2-colour pair against the other pairs. */
function homePair(contexts: Ctx[]): NicheInfo | null {
  const pairs = contexts.filter(c => c.key.length === 2)
  if (pairs.length < MIN_PAIRS) return null

  const home = pairs.reduce((best, c) => (c.delta > best.delta ? c : best))
  const othersDelta = meanDelta(pairs.filter(c => c !== home))
  return {
    home: home.key, partner: null, homeDelta: home.delta, othersDelta,
    homeContexts: 1, gap: home.delta - othersDelta,
  }
}

export const isNicheFormat = (format: string) => !format.toLowerCase().includes('sealed')

export function useFormatNiche(activeSet: string, activeFormat: string, enabled: boolean) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.formatNiche(activeSet, activeFormat),
    queryFn: async (): Promise<FormatNicheResult> => {
      if (!activeSet || !isNicheFormat(activeFormat)) return EMPTY

      const [{ rows, archRows }, typesResult] = await Promise.all([
        fetchFormatContexts(queryClient, activeSet, activeFormat),
        supabase.from('card_list').select('card_name, card_type').eq('set_code', activeSet),
      ])
      if (typesResult.error) throw typesResult.error
      const lands = new Set(
        (typesResult.data ?? []).filter(c => /\bLand\b/.test(c.card_type ?? '')).map(c => c.card_name),
      )

      // WR of each pure (non-splash) 2- and 3-colour archetype, the delta baseline.
      const archetypeWR: Record<string, number> = {}
      for (const a of archRows) {
        const k = colorKey(a.colors)
        if ((k.length === 2 || k.length === 3) && !String(a.colors).includes('Splash') && a.win_rate != null) {
          archetypeWR[k] = a.win_rate
        }
      }

      // Per card: its 2/3-colour contexts with a valued WR and enough games.
      const byCard = new Map<string, { rarity: string; colors: string; contexts: Ctx[] }>()
      for (const row of rows) {
        let agg = byCard.get(row.card_name)
        if (!agg) {
          agg = { rarity: row.rarity, colors: colorKey(row.colors), contexts: [] }
          byCard.set(row.card_name, agg)
        }
        if (row.filter_context === 'Global') continue
        const key = colorKey(row.filter_context)
        if (row.gih_wr == null || row.img_count < MIN_GAMES || archetypeWR[key] == null) continue
        agg.contexts.push({ key, delta: row.gih_wr - archetypeWR[key], games: row.img_count })
      }

      const nicheByName: Record<string, NicheInfo> = {}
      for (const [name, agg] of byCard) {
        const r = normalizeRarity(agg.rarity)
        if (r !== 'C' && r !== 'U') continue

        const info = agg.colors.length === 1
          ? partnerColour(agg.colors, agg.contexts)
          : agg.colors.length === 0 && !lands.has(name)
            ? homePair(agg.contexts)
            : null
        if (info && info.homeDelta >= MIN_HOME_DELTA && info.gap >= MIN_GAP) nicheByName[name] = info
      }

      return { nicheByName }
    },
    enabled: enabled && !!activeSet,
    staleTime: 5 * 60_000,
  })
}

const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

/** Badge tooltip: the two deltas the gap is made of. */
export function describeNiche(info: NicheInfo): string {
  if (info.partner) {
    const n = info.homeContexts
    return `Wants ${info.partner}: ${signed(info.homeDelta)} pts vs the archetype with ${info.partner} `
      + `(${n} archetype${n > 1 ? 's' : ''}), ${signed(info.othersDelta)} without`
  }
  return `Colourless, best in ${sortColorsWUBRG(info.home)}: ${signed(info.homeDelta)} pts vs the archetype, `
    + `${signed(info.othersDelta)} in the other pairs`
}
