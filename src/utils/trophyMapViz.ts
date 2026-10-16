import type { TrophyMapPoint } from '../queries/useTrophyDeckMap';

/**
 * Encodages de la Trophies Map : coloration par une mesure du deck (rampe
 * séquentielle), regroupement par semaine (curseur de temps) et zones de
 * densité par archétype.
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

// ─── Curseur de temps ───────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 3600 * 1000;

export interface Timeline {
  /** Début (ms) de chaque semaine, de la première à la dernière. */
  weekStarts: number[];
  /** Semaine de chaque point (même index que `points`), null sans date. */
  weekOf: (number | null)[];
}

/** Semaines glissantes depuis le premier trophée ; null s'il n'y a pas de dates. */
export function buildTimeline(points: TrophyMapPoint[]): Timeline | null {
  const times = points.map(p => (p.trophy_time ? Date.parse(p.trophy_time) : NaN));
  const valid = times.filter(t => Number.isFinite(t));
  if (valid.length === 0) return null;
  const t0 = Math.min(...valid);
  const weekOf = times.map(t => (Number.isFinite(t) ? Math.floor((t - t0) / WEEK_MS) : null));
  const last = Math.max(...weekOf.filter((w): w is number => w != null));
  if (last < 1) return null; // une seule semaine : rien à animer
  return { weekStarts: Array.from({ length: last + 1 }, (_, i) => t0 + i * WEEK_MS), weekOf };
}

// ─── Zones de densité ───────────────────────────────────────────────────────

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

const GRID = 128;
const SIGMA = 1.7;   // en cellules : assez pour lisser, pas pour baver sur les voisins
const MIN_DECKS = 25; // un archétype plus petit ne dessine pas de zone

const KERNEL = (() => {
  const r = Math.ceil(SIGMA * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * SIGMA * SIGMA)));
  const s = k.reduce((a, b) => a + b, 0);
  return { r, k: k.map(v => v / s) };
})();

function blur(src: Float32Array): Float32Array {
  const { r, k } = KERNEL;
  const tmp = new Float32Array(GRID * GRID), out = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < GRID) s += src[y * GRID + xx] * k[i + r]; }
    tmp[y * GRID + x] = s;
  }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < GRID) s += tmp[yy * GRID + x] * k[i + r]; }
    out[y * GRID + x] = s;
  }
  return out;
}

/**
 * Une image GRID×GRID par archétype : densité lissée de ses decks, dans la
 * couleur de l'archétype, opacité croissante avec la densité. Les images sont
 * en coordonnées UMAP (ligne 0 = maxY) : le rendu les étire sur la zone du
 * graphe, zoom et déplacement compris. Les plus gros archétypes d'abord, pour
 * que les petits restent visibles par-dessus.
 */
export function buildDensityLayers(
  points: TrophyMapPoint[],
  visible: (i: number) => boolean,
  bounds: Bounds,
  keyOf: (p: TrophyMapPoint) => string,
  rgbOf: (p: TrophyMapPoint) => [number, number, number],
): HTMLCanvasElement[] {
  const spanX = (bounds.maxX - bounds.minX) || 1, spanY = (bounds.maxY - bounds.minY) || 1;
  const groups = new Map<string, { rgb: [number, number, number]; cells: Float32Array; n: number }>();
  points.forEach((p, i) => {
    if (p.is_archetypal || !visible(i)) return;
    const key = keyOf(p);
    let g = groups.get(key);
    if (!g) { g = { rgb: rgbOf(p), cells: new Float32Array(GRID * GRID), n: 0 }; groups.set(key, g); }
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor(((p.x - bounds.minX) / spanX) * (GRID - 1))));
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor(((bounds.maxY - p.y) / spanY) * (GRID - 1))));
    g.cells[gy * GRID + gx] += 1;
    g.n++;
  });

  return [...groups.values()]
    .filter(g => g.n >= MIN_DECKS)
    .sort((a, b) => b.n - a.n)
    .map(g => {
      const d = blur(g.cells);
      let max = 0;
      for (const v of d) if (v > max) max = v;
      const canvas = document.createElement('canvas');
      canvas.width = GRID; canvas.height = GRID;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(GRID, GRID);
      for (let i = 0; i < d.length; i++) {
        const t = max > 0 ? d[i] / max : 0;
        if (t < 0.2) continue; // coupe la traîne : des zones nettes plutôt qu'un voile
        img.data[i * 4] = g.rgb[0];
        img.data[i * 4 + 1] = g.rgb[1];
        img.data[i * 4 + 2] = g.rgb[2];
        // Opacité nulle au seuil puis croissante : bord adouci, pas d'escalier.
        // Assez opaque pour se lire seule : les points sont masqués en densité.
        img.data[i * 4 + 3] = Math.round(255 * 0.85 * Math.pow((t - 0.2) / 0.8, 0.5));
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    });
}
