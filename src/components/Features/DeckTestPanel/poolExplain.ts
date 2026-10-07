// Helpers d'explicabilite du Pool Analysis (fonctions pures, sans React).
import type { PoolCardMeta, SealedDeckResult } from '../../../hooks/usePoolAnalysis';

// Points de win rate par partie pour 1 point de score, a niveau de joueur egal.
// Mesure sur les parties publiques 17Lands (Sealed MSH et HOB, proxies valides
// d'ArenaDirect) : +10 pts de score = +3,0 / +3,6 pts de WR. Voir
// backend/reports/benchmarks/outcome_calibration/.
export const WR_POINTS_PER_SCORE_POINT = 0.33;

export const scoreDeltaToWr = (scoreDelta: number): number =>
  scoreDelta * WR_POINTS_PER_SCORE_POINT;

export const formatSigned = (value: number, digits = 1): string =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;

// Libelle court d'un build : "UBr · 84.2".
export const buildTabLabel = (build: SealedDeckResult): string =>
  `${build.archetype} · ${build.score.toFixed(1)}`;

export type BuildDiff = {
  removed: Array<{ name: string; qty: number }>;
  added: Array<{ name: string; qty: number }>;
  colorChange: string | null;
};

const toCounts = (cards: Array<{ name: string; qty: number }>): Map<string, number> => {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.name, (m.get(c.name) || 0) + c.qty);
  return m;
};

// Cartes (hors terrains) a retirer / ajouter pour passer de `from` a `to`.
export const diffBuilds = (from: SealedDeckResult, to: SealedDeckResult): BuildDiff => {
  const a = toCounts(from.cards);
  const b = toCounts(to.cards);
  const removed: BuildDiff['removed'] = [];
  const added: BuildDiff['added'] = [];
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const delta = (b.get(name) || 0) - (a.get(name) || 0);
    if (delta < 0) removed.push({ name, qty: -delta });
    if (delta > 0) added.push({ name, qty: delta });
  }
  removed.sort((x, y) => x.name.localeCompare(y.name));
  added.sort((x, y) => x.name.localeCompare(y.name));
  const colorChange = from.archetype !== to.archetype ? `${from.archetype} → ${to.archetype}` : null;
  return { removed, added, colorChange };
};

export type SummaryLine = { tone: 'good' | 'neutral' | 'warn'; text: string };

// Resume en langage joueur, derive du detail du score (3 a 5 lignes).
export const summarizeBuild = (build: SealedDeckResult): SummaryLine[] => {
  const b = build.scoreBreakdown;
  const s = build.stats;
  const ex = build.explanation;
  const lines: SummaryLine[] = [];

  const bombs = ex ? Object.values(ex.cardRoles).filter((r) => r.bomb).length : 0;
  const power = b.wrNormalized;
  const powerText =
    power >= 75 ? 'Very strong card quality' : power >= 55 ? 'Solid card quality' : power >= 35 ? 'Average card quality' : 'Below-average card quality';
  const meanText = ex ? ` (avg ${b.wrScore.toFixed(1)}% vs ${ex.formatMean.toFixed(1)}% format mean)` : '';
  lines.push({
    tone: power >= 55 ? 'good' : power >= 35 ? 'neutral' : 'warn',
    text: `${powerText}${meanText}${bombs > 0 ? `, ${bombs} bomb${bombs > 1 ? 's' : ''}` : ''}.`,
  });

  const shortColors = ex ? ex.manaPlan.filter((m) => m.sources + 0.5 < m.required) : [];
  if (shortColors.length > 0) {
    lines.push({
      tone: 'warn',
      text: `Mana is tight on ${shortColors.map((m) => `${m.color} (${m.sources}/${Math.ceil(m.required)} sources)`).join(', ')}.`,
    });
  } else {
    lines.push({
      tone: b.consistencyScore >= 80 ? 'good' : 'neutral',
      text: b.consistencyScore >= 80 ? 'Stable mana: every color has enough sources.' : 'Mana is workable but not fully stable.',
    });
  }

  const curveNotes: string[] = [];
  if ((b.curveTopHeavyPenalty || 0) > 0.05) curveNotes.push('a bit top-heavy');
  if ((b.curveEarlyCreaturePenalty || 0) > 0.05) curveNotes.push('few early creatures');
  if (s.creatureCount < 12) curveNotes.push(`only ${s.creatureCount} creatures`);
  lines.push({
    tone: curveNotes.length ? 'warn' : 'good',
    text: curveNotes.length
      ? `Curve: ${curveNotes.join(', ')} (avg mana value ${s.avgCmc.toFixed(2)}).`
      : `Healthy curve: ${s.creatureCount} creatures, avg mana value ${s.avgCmc.toFixed(2)}.`,
  });

  lines.push({
    tone: s.removalCount >= 4 ? 'good' : 'warn',
    text: s.removalCount >= 4 ? `${s.removalCount} removal spells.` : `Light on removal (${s.removalCount}, aim for 4+).`,
  });

  const unmet = ex ? Object.entries(ex.cardRoles).filter(([, r]) => r.dependency === 'unmet').map(([n]) => n) : [];
  if (unmet.length > 0) {
    lines.push({ tone: 'warn', text: `Payoff without enough support: ${unmet.join(', ')}.` });
  }
  if (build.splashColor) {
    const splashCards = ex ? Object.entries(ex.cardRoles).filter(([, r]) => r.splash).map(([n]) => n) : [];
    lines.push({
      tone: 'neutral',
      text: `Splash ${build.splashColor}${splashCards.length ? ` for ${splashCards.join(', ')}` : ''}.`,
    });
  }
  return lines;
};

// Apercu du pool affiche pendant le calcul : profondeur par couleur et rares.
export type PoolPreview = {
  total: number;
  byColor: Record<'W' | 'U' | 'B' | 'R' | 'G', number>;
  multicolor: number;
  colorless: number;
  raresMythics: number;
};

export const parsePoolNames = (text: string): Array<{ name: string; qty: number }> => {
  const out: Array<{ name: string; qty: number }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/);
    if (!m) continue;
    const name = m[2].trim();
    if (['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(name)) continue;
    out.push({ name, qty: Number(m[1]) });
  }
  return out;
};

export const buildPoolPreview = (
  cards: Array<{ name: string; qty: number }>,
  metaByName: Record<string, PoolCardMeta>,
): PoolPreview => {
  const preview: PoolPreview = {
    total: 0,
    byColor: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    multicolor: 0,
    colorless: 0,
    raresMythics: 0,
  };
  for (const { name, qty } of cards) {
    preview.total += qty;
    const meta = metaByName[name];
    if (!meta) continue;
    if ((meta.type || '').includes('Land')) continue;
    const colors = [...new Set((meta.colors || '').toUpperCase().split('').filter((c) => 'WUBRG'.includes(c)))];
    if (colors.length === 0) preview.colorless += qty;
    else if (colors.length > 1) preview.multicolor += qty;
    else preview.byColor[colors[0] as keyof PoolPreview['byColor']] += qty;
    if (/rare|mythic/i.test(meta.rarity || '')) preview.raresMythics += qty;
  }
  return preview;
};
