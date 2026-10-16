import type { TrophyMapPoint } from '../queries/useTrophyDeckMap';

/**
 * Coloration de la Trophies Map par une mesure du deck (rares, CMC moyen,
 * défaites), sur une échelle divergente centrée sur le deck médian.
 */

// ─── Coloration par mesure ──────────────────────────────────────────────────

// Échelle divergente bleu ↔ rouge autour de la médiane, gris neutre au
// milieu : « en dessous / au-dessus du deck typique » se lit d'un coup d'œil,
// bien mieux qu'un dégradé d'une seule teinte sur 15 000 points. Le gris est
// éclairci par rapport à un fond de remplissage : sur fond quasi noir, un gris
// sombre ferait disparaître les points du milieu.
const DIVERGING = ['#3987e5', '#7ea9de', '#9a9a96', '#e09a92', '#e66767']
  .map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]);

/** Couleur pour t ∈ [0, 1] : 0 = pôle bleu, 0.5 = médiane (gris), 1 = pôle rouge. */
export function scaleColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (DIVERGING.length - 1);
  const i = Math.min(DIVERGING.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [DIVERGING[i], DIVERGING[i + 1]];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

export type ColorMode = 'archetype' | 'rares' | 'cmc' | 'losses';

export interface ColorModeDef {
  key: Exclude<ColorMode, 'archetype'>;
  label: string;
  value: (p: TrophyMapPoint) => number | null;
  /** Libellé court d'une valeur pour la légende (l'unité est dans `label`). */
  format: (v: number) => string;
  /** Ordinal (0/1/2 défaites) : paliers fixes plutôt qu'un dégradé. */
  ordinal?: boolean;
}

export const COLOR_MODES: ColorModeDef[] = [
  { key: 'rares', label: 'Rares & mythics', value: p => p.rare_count ?? null, format: v => `${Math.round(v)}` },
  { key: 'cmc', label: 'Avg mana value', value: p => p.avg_cmc ?? null, format: v => v.toFixed(2) },
  { key: 'losses', label: 'Losses', value: p => p.losses ?? null, format: v => `7-${Math.round(v)}`, ordinal: true },
];

export interface ColorScale {
  def: ColorModeDef;
  lo: number;
  mid: number;
  hi: number;
  /** Couleur d'un point, null si la mesure manque. */
  colorOf: (p: TrophyMapPoint) => string | null;
}

/**
 * Échelle d'une mesure, centrée sur la médiane. Les pôles sont bornés aux
 * percentiles 5 et 95 : quelques decks extrêmes écraseraient sinon tout le
 * dégradé. Les défaites vont de 7-0 (bleu) à 7-2 (rouge), 7-1 au milieu.
 */
export function buildColorScale(def: ColorModeDef, points: TrophyMapPoint[]): ColorScale | null {
  const values = points.map(def.value).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (values.length === 0) return null;
  if (def.ordinal) {
    const lo = 0, mid = 1, hi = 2;
    return { def, lo, mid, hi, colorOf: p => { const v = def.value(p); return v == null ? null : scaleColor(Math.min(hi, v) / hi); } };
  }
  const q = (f: number) => values[Math.min(values.length - 1, Math.floor(f * (values.length - 1)))];
  const lo = q(0.05), mid = q(0.5), hi = q(0.95);
  const toT = (v: number) => (v <= mid
    ? 0.5 * (mid > lo ? (v - lo) / (mid - lo) : 1)
    : 0.5 + 0.5 * (hi > mid ? (v - mid) / (hi - mid) : 0));
  return { def, lo, mid, hi, colorOf: p => { const v = def.value(p); return v == null ? null : scaleColor(toT(v)); } };
}
