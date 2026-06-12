// Comparaison avant/après de la formule pivots (non pondérée vs pondérée meta share)
// Usage: node scripts/compare_pivots_sos.mjs [SET] [FORMAT]
import { createClient } from '@supabase/supabase-js'

const SET = process.argv[2] || 'SOS'
const FORMAT = process.argv[3] || 'PremierDraft'

const supabase = createClient(
  'https://zwphdbwivzsvnmalybkx.supabase.co',
  'sb_publishable_2Kqi5EKFBTjwwJC1Swq2pg_fo2esM9S'
)

const PIVOT_PERCENTILE = 0.20
const MIN_ARCHETYPES = 3
const MIN_META_COVERAGE = 25
const MIN_MEAN_DELTA = -1.25

const colorKey = (s) =>
  String(s ?? '').replace(' + Splash', '').replace(/[^WUBRG]/g, '').split('').sort().join('')

const AGGREGATE_NAMES = new Set([
  'All Decks', 'Two-color', 'Two-color + Splash', 'Three-color',
  'Three-color + Splash', 'Mono-color', 'Mono-color + Splash',
])

const normalizeRarity = (r) => {
  if (!r) return 'C'
  const first = r.charAt(0).toUpperCase()
  return ['M', 'R', 'U', 'C'].includes(first) ? first : 'C'
}

const COLS = 'card_name, rarity, filter_context, gih_wr, img_count'
const PAGE = 1000
const page = (from, withCount) =>
  supabase.from('card_stats')
    .select(COLS, withCount ? { count: 'exact' } : undefined)
    .eq('set_code', SET).eq('format', FORMAT)
    .order('card_name', { ascending: true })
    .order('filter_context', { ascending: true })
    .range(from, from + PAGE - 1)

const [archResult, firstPage] = await Promise.all([
  supabase.from('archetype_stats')
    .select('archetype_name, colors, win_rate, games_count')
    .eq('set_code', SET).eq('format', FORMAT),
  page(0, true),
])
if (archResult.error) throw archResult.error
if (firstPage.error) throw firstPage.error

const archRows = archResult.data ?? []
const globalMeanWR = archRows.find(a => a.archetype_name === 'All Decks')?.win_rate ?? 55.0
const individualDecks = archRows.filter(a => !AGGREGATE_NAMES.has(a.archetype_name))
const totalGames = individualDecks.reduce((s, d) => s + (d.games_count || 0), 0) || 1

const metaShareByColors = {}
const archetypeWRByColors = {}
for (const d of individualDecks) {
  const k = colorKey(d.colors)
  metaShareByColors[k] = (metaShareByColors[k] || 0) + (d.games_count || 0) / totalGames * 100
  if (!String(d.colors).includes('Splash') && d.win_rate != null) archetypeWRByColors[k] = d.win_rate
}

const total = firstPage.count ?? firstPage.data?.length ?? 0
const rows = [...(firstPage.data ?? [])]
const reqs = []
for (let from = PAGE; from < total; from += PAGE) reqs.push(page(from, false))
for (const res of await Promise.all(reqs)) {
  if (res.error) throw res.error
  rows.push(...(res.data ?? []))
}
console.log(`${SET} / ${FORMAT} — ${rows.length} lignes card_stats, baseline All Decks WR = ${globalMeanWR.toFixed(2)}%`)

const minGames = FORMAT.toLowerCase().includes('sealed') ? 10 : 500

const byCard = new Map()
for (const row of rows) {
  let agg = byCard.get(row.card_name)
  if (!agg) { agg = { rarity: row.rarity, globalWr: null, archStats: [] }; byCard.set(row.card_name, agg) }
  if (row.filter_context === 'Global') agg.globalWr = row.gih_wr
  else {
    const ctxLen = (String(row.filter_context).match(/[WUBRG]/g) || []).length
    if ((ctxLen === 2 || ctxLen === 3) && row.gih_wr != null && row.img_count >= minGames) {
      agg.archStats.push({ ctx: row.filter_context, wr: row.gih_wr })
    }
  }
}

// Calcule les deux versions sur le même pool d'éligibles (les filtres
// MIN_ARCHETYPES / coverage sont identiques; seul MIN_MEAN_DELTA peut
// diverger via la moyenne pondérée — on le trace).
const results = [] // { name, stdOld, stdNew, meanOld, meanNew, coverage, n, details }
for (const [name, agg] of byCard) {
  const r = normalizeRarity(agg.rarity)
  if (r !== 'C' && r !== 'U') continue
  if (agg.globalWr == null || agg.globalWr < globalMeanWR) continue

  const entries = agg.archStats
    .filter(a => archetypeWRByColors[colorKey(a.ctx)] != null)
    .map(a => ({ key: colorKey(a.ctx), ctx: a.ctx, delta: a.wr - archetypeWRByColors[colorKey(a.ctx)] }))
  if (entries.length < MIN_ARCHETYPES) continue

  const coveredKeys = new Set(agg.archStats.map(a => colorKey(a.ctx)))
  let coverage = 0
  for (const k of coveredKeys) coverage += metaShareByColors[k] || 0
  if (coverage < MIN_META_COVERAGE) continue

  // --- ancienne formule (poids égaux) ---
  const deltas = entries.map(e => e.delta)
  const meanOld = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const stdOld = Math.sqrt(deltas.reduce((s, v) => s + (v - meanOld) ** 2, 0) / deltas.length)

  // --- nouvelle formule (pondérée meta share) ---
  const keyCount = {}
  for (const e of entries) keyCount[e.key] = (keyCount[e.key] || 0) + 1
  let weights = entries.map(e => (metaShareByColors[e.key] || 0) / keyCount[e.key])
  let totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight <= 0) { weights = entries.map(() => 1); totalWeight = entries.length }
  const meanNew = entries.reduce((s, e, i) => s + weights[i] * e.delta, 0) / totalWeight
  const stdNew = Math.sqrt(entries.reduce((s, e, i) => s + weights[i] * (e.delta - meanNew) ** 2, 0) / totalWeight)

  results.push({ name, meanOld, meanNew, stdOld, stdNew, coverage, entries, weights, totalWeight })
}

const eligOld = results.filter(c => c.meanOld >= MIN_MEAN_DELTA).sort((a, b) => a.stdOld - b.stdOld)
const eligNew = results.filter(c => c.meanNew >= MIN_MEAN_DELTA).sort((a, b) => a.stdNew - b.stdNew)
const cutOld = eligOld.length ? Math.max(1, Math.round(eligOld.length * PIVOT_PERCENTILE)) : 0
const cutNew = eligNew.length ? Math.max(1, Math.round(eligNew.length * PIVOT_PERCENTILE)) : 0
const pivotsOld = new Set(eligOld.slice(0, cutOld).map(c => c.name))
const pivotsNew = new Set(eligNew.slice(0, cutNew).map(c => c.name))

console.log(`\nÉligibles: avant=${eligOld.length}, après=${eligNew.length} | cut 15%: avant=${cutOld}, après=${cutNew}`)

const rankOld = new Map(eligOld.map((c, i) => [c.name, i + 1]))
const rankNew = new Map(eligNew.map((c, i) => [c.name, i + 1]))

const fmt = (c) => {
  const ro = rankOld.get(c.name) ?? '—'
  const rn = rankNew.get(c.name) ?? '—'
  return `  ${c.name.padEnd(32)} stdAvant=${c.stdOld.toFixed(2).padStart(5)} (#${String(ro).padStart(3)})  stdAprès=${c.stdNew.toFixed(2).padStart(5)} (#${String(rn).padStart(3)})  cov=${c.coverage.toFixed(0)}%`
}
const byName = new Map(results.map(c => [c.name, c]))

console.log(`\n=== PIVOTS AVANT (${pivotsOld.size}) ===`)
for (const c of eligOld.slice(0, cutOld)) console.log(fmt(c) + (pivotsNew.has(c.name) ? '' : '   ← SORT'))
console.log(`\n=== PIVOTS APRÈS (${pivotsNew.size}) ===`)
for (const c of eligNew.slice(0, cutNew)) console.log(fmt(c) + (pivotsOld.has(c.name) ? '' : '   ← ENTRE'))

// Cartes dont l'éligibilité a basculé via la moyenne pondérée
const flipped = results.filter(c => (c.meanOld >= MIN_MEAN_DELTA) !== (c.meanNew >= MIN_MEAN_DELTA))
if (flipped.length) {
  console.log('\n=== Éligibilité basculée par la moyenne pondérée ===')
  for (const c of flipped) console.log(`  ${c.name}: meanAvant=${c.meanOld.toFixed(2)} meanAprès=${c.meanNew.toFixed(2)}`)
}

// Focus sur une carte si demandée (3e argument, sinon Elite Interceptor)
const focusArg = (process.argv[4] || 'elite interceptor').toLowerCase()
const focus = [...byCard.keys()].find(n => n.toLowerCase().includes(focusArg))
if (focus && byName.has(focus)) {
  const c = byName.get(focus)
  console.log(`\n=== Focus: ${focus} ===`)
  console.log(`  meanAvant=${c.meanOld.toFixed(2)} stdAvant=${c.stdOld.toFixed(2)} rangAvant=#${rankOld.get(focus) ?? 'inéligible'} / ${eligOld.length}`)
  console.log(`  meanAprès=${c.meanNew.toFixed(2)} stdAprès=${c.stdNew.toFixed(2)} rangAprès=#${rankNew.get(focus) ?? 'inéligible'} / ${eligNew.length}`)
  console.log(`  pivot: avant=${pivotsOld.has(focus)} après=${pivotsNew.has(focus)}`)
  console.log('  Détail par archétype (delta, poids %):')
  for (let i = 0; i < c.entries.length; i++) {
    const e = c.entries[i]
    console.log(`    ${e.ctx.padEnd(20)} delta=${e.delta.toFixed(2).padStart(6)}  poids=${(c.weights[i] / c.totalWeight * 100).toFixed(1)}%  (meta ${String((metaShareByColors[e.key] || 0).toFixed(1)).padStart(5)}%)`)
  }
} else if (focus) {
  console.log(`\nFocus "${focus}": trouvé dans card_stats mais non éligible (rareté/WR global/archétypes/coverage).`)
} else {
  console.log('\nAucune carte "Interceptor" trouvée dans ce set/format.')
}
