import { FORMAT_OPTIONS, PLAYER_LEVEL_OPTIONS, PAIRS, TRIOS } from '../../../constants';
import { extractColors, normalizeRarity, sortColorsWUBRG } from '../../../utils/helpers';

export type Axis = 'format' | 'skill';
export type Subject = 'archetypes' | 'cards';
export type Metric = 'wr' | 'meta';
export type ArchType = 'all' | '2color' | 'splash' | '3color';
export type SortKey = 'shift' | 'a' | 'b' | 'games' | 'name';

export interface CompareSettings {
  axis: Axis;
  subject: Subject;
  /** Format (axe format) ou niveau de joueur (axe skill) de reference. */
  a: string;
  /** Format ou niveau compare a la reference. */
  b: string;
  /** Format unique de l'axe skill. */
  skillFormat: string;
  metric: Metric;
}

export interface CompareFilters {
  search: string;
  colors: string[];   // W U B R G, 'multi', 'colorless'
  rarities: string[]; // M R U C
  archType: ArchType;
  hideSmallSamples: boolean;
}

export interface CompareRow {
  key: string;
  kind: 'card' | 'archetype';
  /** Nom de la carte, ou code couleurs de l'archetype (filter_context). */
  id: string;
  label: string;
  colors: string;
  isSplash: boolean;
  rarity: string | null;
  /** Valeurs tracees et comparees : ecart a la moyenne (WR) ou part de meta. */
  a: number;
  b: number;
  /** a - b (gauche - droite) : positif = la carte/l'archetype fait mieux en A. */
  shift: number;
  gamesA: number | null;
  gamesB: number | null;
  smallSample: boolean;
}

/** Suffixe des colonnes des vues pivot, par format. */
const PIVOT_SUFFIX: Record<string, string> = {
  PremierDraft: 'premier',
  TradDraft: 'trad',
  Sealed: 'sealed',
  ArenaDirect_Sealed: 'direct',
};

/** En dessous, l'ecart est trop bruite pour etre lu (min des deux cotes). */
export const SMALL_SAMPLE = { cards: 500, archetypes: 1000 };

/** |shift| sous ce seuil : ecart neutre, affiche en gris. */
export const NEUTRAL_SHIFT = 1;

export const formatLabel = (v: string) => FORMAT_OPTIONS.find(o => o.value === v)?.label ?? v;
export const formatShort = (v: string) => FORMAT_OPTIONS.find(o => o.value === v)?.short ?? v;
export const levelLabel = (v: string) => PLAYER_LEVEL_OPTIONS.find(o => o.value === v)?.label ?? v;

export const sideLabel = (s: CompareSettings, side: 'a' | 'b') =>
  s.axis === 'skill' ? `${levelLabel(s[side])} players` : formatLabel(s[side]);
export const sideShort = (s: CompareSettings, side: 'a' | 'b') =>
  s.axis === 'skill' ? levelLabel(s[side]) : formatShort(s[side]);

/** « Simic (UG) + Splash » a partir de « GU + Splash ». */
export function archetypeLabel(filterContext: string): string {
  const colors = sortColorsWUBRG(extractColors(filterContext));
  const splash = /splash/i.test(filterContext) ? ' + Splash' : '';
  const sameSet = (code: string) => code.length === colors.length && [...code].every(c => colors.includes(c));
  const guild = [...PAIRS, ...TRIOS].find(p => sameSet(p.code));
  const name = guild ? guild.name.replace(/\s*\(.*\)$/, '') : colors;
  return guild ? `${name} (${colors})${splash}` : `${colors}${splash}`;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const matchesArchType = (filterContext: string, t: ArchType) => {
  const colors = extractColors(filterContext);
  const splash = /splash/i.test(filterContext);
  if (t === '2color') return colors.length === 2 && !splash;
  if (t === 'splash') return colors.length === 2 && splash;
  if (t === '3color') return colors.length === 3 && !splash;
  return colors.length === 2 || (colors.length === 3 && !splash);
};

const matchesColors = (cardColors: string, filters: string[]) => {
  if (filters.length === 0) return true;
  const c = extractColors(cardColors);
  if (filters.includes('multi') && c.length > 1) return true;
  if (filters.includes('colorless') && c.length === 0) return true;
  return filters.some(f => 'WUBRG'.includes(f) && f.length === 1 && c.includes(f));
};

/**
 * Transforme les lignes du pivot en lignes comparables. Les lignes sans valeur
 * des deux cotes sont ecartees : on ne peut rien en dire.
 */
export function buildRows(
  data: any[],
  s: CompareSettings,
  gamesBy: Record<string, Record<string, number>> | undefined,
): CompareRow[] {
  const rows: CompareRow[] = [];
  const isCards = s.axis === 'skill' || s.subject === 'cards';

  // Axe skill : les meilleurs joueurs gagnent plus avec presque toutes les
  // cartes. Chaque niveau est mesure contre son WR moyen de carte, pour isoler
  // les cartes qui recompensent le skill PLUS que la moyenne.
  let meanA = 0, meanB = 0;
  if (s.axis === 'skill') {
    let n = 0;
    for (const item of data) {
      const x = num(item[`card_wr_${s.a}`]), y = num(item[`card_wr_${s.b}`]);
      if (x !== null && y !== null) { meanA += x; meanB += y; n++; }
    }
    if (n > 0) { meanA /= n; meanB /= n; }
  }

  for (const item of data) {
    let a: number | null, b: number | null;
    let gamesA: number | null = null, gamesB: number | null = null;

    if (s.axis === 'skill') {
      const wrA = num(item[`card_wr_${s.a}`]);
      const wrB = num(item[`card_wr_${s.b}`]);
      a = wrA !== null ? wrA - meanA : null;
      b = wrB !== null ? wrB - meanB : null;
    } else {
      const sa = PIVOT_SUFFIX[s.a], sb = PIVOT_SUFFIX[s.b];
      const prefix = isCards ? 'card' : 'arch';
      if (!isCards && s.metric === 'meta') {
        a = num(item[`meta_share_${sa}`]);
        b = num(item[`meta_share_${sb}`]);
      } else {
        a = num(item[`${prefix}_delta_${sa}`]);
        b = num(item[`${prefix}_delta_${sb}`]);
      }
      const id = isCards ? item.card_name : item.filter_context;
      gamesA = gamesBy?.[s.a]?.[id] ?? null;
      gamesB = gamesBy?.[s.b]?.[id] ?? null;
    }
    if (a === null || b === null) continue;

    const threshold = isCards ? SMALL_SAMPLE.cards : SMALL_SAMPLE.archetypes;
    const known = gamesA !== null && gamesB !== null;
    const id: string = isCards ? item.card_name : item.filter_context;

    rows.push({
      key: id,
      kind: isCards ? 'card' : 'archetype',
      id,
      label: isCards ? item.card_name : archetypeLabel(item.filter_context),
      colors: isCards ? (item.colors || '') : extractColors(item.filter_context),
      isSplash: !isCards && /splash/i.test(item.filter_context),
      rarity: isCards ? normalizeRarity(item.rarity) : null,
      a, b,
      shift: a - b,
      gamesA, gamesB,
      smallSample: known && Math.min(gamesA!, gamesB!) < threshold,
    });
  }
  return rows;
}

export function filterRows(rows: CompareRow[], f: CompareFilters): { visible: CompareRow[]; hiddenSmall: number } {
  const q = f.search.trim().toLowerCase();
  let hiddenSmall = 0;
  const visible = rows.filter(r => {
    if (r.kind === 'card') {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (f.rarities.length && !f.rarities.includes(r.rarity || 'C')) return false;
      if (!matchesColors(r.colors, f.colors)) return false;
    } else if (!matchesArchType(r.id, f.archType)) {
      return false;
    }
    if (f.hideSmallSamples && r.smallSample) { hiddenSmall++; return false; }
    return true;
  });
  return { visible, hiddenSmall };
}

export function sortRows(rows: CompareRow[], key: SortKey, dir: 'asc' | 'desc'): CompareRow[] {
  const sign = dir === 'desc' ? -1 : 1;
  const val = (r: CompareRow): number | string => {
    switch (key) {
      case 'a': return r.a;
      case 'b': return r.b;
      case 'games': return Math.min(r.gamesA ?? -1, r.gamesB ?? -1);
      case 'name': return r.label.toLowerCase();
      default: return r.shift;
    }
  };
  return [...rows].sort((x, y) => {
    const vx = val(x), vy = val(y);
    if (typeof vx === 'string' && typeof vy === 'string') return sign * vx.localeCompare(vy);
    return sign * ((vx as number) - (vy as number));
  });
}

/** Domaine commun des dumbbells, arrondi a un pas lisible. */
export function axisDomain(rows: CompareRow[], s: CompareSettings): [number, number] {
  if (rows.length === 0) return [0, 1];
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) { lo = Math.min(lo, r.a, r.b); hi = Math.max(hi, r.a, r.b); }
  const isMeta = s.axis === 'format' && s.subject === 'archetypes' && s.metric === 'meta';
  if (isMeta) return [0, Math.max(1, Math.ceil(hi))];
  const m = Math.max(2, Math.ceil(Math.max(Math.abs(lo), Math.abs(hi)) / 2) * 2);
  return [-m, m];
}

/** Unite des valeurs affichees (pas celle du shift, toujours en points). */
export function valueKind(s: CompareSettings): 'delta' | 'share' {
  return s.axis === 'format' && s.subject === 'archetypes' && s.metric === 'meta' ? 'share' : 'delta';
}

/** Arrondi au dixieme, sans « -0.0 ». */
const tenth = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};
const signed = (v: number) => { const r = tenth(v); return `${r > 0 ? '+' : ''}${r.toFixed(1)}`; };

export const fmtValue = (v: number, kind: 'delta' | 'share') =>
  kind === 'delta' ? signed(v) : `${tenth(v).toFixed(1)}%`;

export const fmtShift = signed;

export const fmtGames = (n: number | null) =>
  n === null ? '—' : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export const shiftTone = (shift: number) =>
  Math.abs(shift) < NEUTRAL_SHIFT ? 'neutral' : shift > 0 ? 'up' : 'down';

export const TONE_TEXT = { up: 'text-emerald-400', down: 'text-rose-400', neutral: 'text-slate-400' } as const;
export const TONE_BG = { up: 'bg-emerald-400', down: 'bg-rose-400', neutral: 'bg-slate-500' } as const;
