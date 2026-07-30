// ─── Manabase suggestion (auto-lands) ────────────────────────────────────────
// Propose une répartition de terres de base pour un deck 40 cartes en cours de
// construction (Draft Practice → phase "build").
//
// C'est un PORT FRONTEND, volontairement autonome, de la logique de manabase du
// sealed optimizer (`supabase/functions/_shared/sealedOptimizerCore.ts` :
// `determineLands`, `karstenRequiredSources`, `countRequiredColorPipsForDeck`).
// Ce n'est PAS un miroir : l'optimizer choisit aussi les sorts et les terres
// non-base depuis un pool, ici les cartes sont imposées par le joueur et on ne
// résout que les basics. Aucune dépendance React / Supabase : fonction pure.
//
// Principe :
//   1. les couleurs du deck sont déduites des pips RÉELLEMENT demandés par les
//      cartes que le joueur a mises dans son deck (pas de l'archétype du pro),
//   2. chaque carte exprime un besoin de sources par couleur (table Karsten
//      calibrée Limited 40 cartes / 17 terres),
//   3. les terres non-base et les créatures/artefacts producteurs de mana déjà
//      dans le deck comptent comme des sources (pondérées par leur CMC),
//   4. la répartition des basics restants est choisie par recherche exhaustive
//      sur les compositions, en minimisant déficit de sources + incastabilité.
// ─────────────────────────────────────────────────────────────────────────────

export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type ManaColorCode = (typeof MANA_COLORS)[number];

const COLOR_SET = new Set<string>(MANA_COLORS);

export const BASIC_LAND_OF: Record<string, string> = {
  W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest',
};
const BASIC_LAND_NAMES = new Set(Object.values(BASIC_LAND_OF));

/** Méta minimale nécessaire au calcul, par nom de carte. */
export interface ManaCardMeta {
  /** Coût mana Scryfall-like, ex. "{1}{W}{W}". Null = inconnu. */
  cost: string | null;
  cmc: number;
  /** Ligne de type, ex. "Creature — Elf Druid". Sert à repérer les terres. */
  type: string | null;
  /** Identité couleur de la carte (fallback quand `cost` est absent). */
  colors: string | null;
  /** Couleurs que la carte produit (colonne `produced_colours`). */
  producedColours?: string | null;
  /** La carte produit-elle du mana (colonne `is_mana_producer`). */
  isManaProducer?: boolean;
}

export interface AutoLandsResult {
  /** Terres de base suggérées par couleur (clés W/U/B/R/G, toujours présentes). */
  basics: Record<string, number>;
  /** Basics suggérés + terres non-base déjà présentes dans le deck. */
  totalLands: number;
  /** Nombre de sorts (non-terres) comptés dans le deck. */
  spellCount: number;
  /** Couleurs principales retenues, ordre WUBRG. */
  mainColors: string[];
  /** Couleurs traitées en splash (demande marginale), ordre WUBRG. */
  splashColors: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const extractColors = (raw: string | null | undefined): string[] =>
  raw ? [...raw.toUpperCase()].filter((ch) => COLOR_SET.has(ch)) : [];

const extractManaSymbols = (cost: string | null | undefined): string[] =>
  cost ? [...cost.toUpperCase().matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim()) : [];

const isLandType = (type: string | null | undefined): boolean =>
  (type || '').toLowerCase().includes('land');

/** Terres qui cherchent n'importe quelle base : comptent pour toutes les couleurs. */
const isFetchLand = (name: string): boolean =>
  /evolving wilds|terramorphic expanse|fabled passage|escape tunnel|prismatic vista/i.test(name);

/**
 * Pips d'une couleur réellement exigés par un coût, dans le contexte des
 * couleurs du deck. Un hybride ne compte pour une couleur que si c'est la seule
 * couleur du deck capable de payer le symbole (sinon il est payable autrement).
 */
const requiredPips = (cost: string | null | undefined, color: string, deckColors: string[]): number => {
  const deckColorSet = new Set(deckColors);
  let count = 0;
  for (const symbol of extractManaSymbols(cost)) {
    if (symbol === color) { count++; continue; }
    if (!symbol.includes('/')) continue;
    // Phyrexian ({W/P}) : payable en vie, jamais une contrainte de couleur.
    if (symbol.endsWith('/P')) continue;
    const options = symbol.split('/').map((p) => p.trim()).filter((p) => COLOR_SET.has(p));
    if (!options.includes(color)) continue;
    const feasible = options.filter((p) => deckColorSet.has(p));
    if (feasible.length === 1 && feasible[0] === color) count++;
  }
  return count;
};

/** Un producteur de mana non-terrain vaut d'autant moins qu'il coûte cher. */
const nonLandSourceWeight = (cmc: number): number => {
  if (cmc <= 1) return 1.0;
  if (cmc === 2) return 0.7;
  if (cmc === 3) return 0.4;
  return 0.2;
};

/**
 * Sources nécessaires (table Karsten resserrée pour le Limited 40 cartes,
 * cible ~85% de cast on-curve). Une couleur en splash se contente de peu.
 */
const karstenRequiredSources = (pips: number, cmc: number, isSplash: boolean): number => {
  if (isSplash) return cmc >= 6 ? 3 : cmc >= 4 ? 4 : 6;
  if (pips >= 3) return cmc <= 3 ? 14 : cmc <= 4 ? 13 : cmc <= 5 ? 12 : 11;
  if (pips === 2) return cmc <= 2 ? 12 : cmc <= 3 ? 11 : cmc <= 4 ? 10 : 9;
  return cmc <= 2 ? 8 : cmc <= 3 ? 7 : 6;
};

interface DeckEntry { name: string; qty: number; meta: ManaCardMeta | undefined }

/** Demande totale de pips par couleur, dans un contexte de couleurs donné. */
const pipDemandOf = (spells: DeckEntry[], colors: string[]): Record<string, number> => {
  const demand: Record<string, number> = {};
  for (const c of MANA_COLORS) demand[c] = 0;
  for (const e of spells) {
    for (const c of colors) demand[c] += requiredPips(e.meta?.cost, c, colors) * e.qty;
  }
  return demand;
};

/**
 * Couleurs du deck : on part de toutes celles qui apparaissent, puis on sépare
 * principales / splash sur la part de demande en pips. Une couleur qui ne pèse
 * presque rien (1 pip isolé, < 12% de la demande) n'a pas besoin de 8 sources.
 */
const resolveDeckColors = (spells: DeckEntry[]): { mainColors: string[]; splashColors: string[] } => {
  const candidates = new Set<string>();
  for (const e of spells) {
    for (const s of extractManaSymbols(e.meta?.cost)) {
      if (s.endsWith('/P')) {
        const base = s.replace('/P', '');
        if (COLOR_SET.has(base)) candidates.add(base);
        continue;
      }
      for (const part of s.split('/')) if (COLOR_SET.has(part)) candidates.add(part);
    }
    // Fallback quand le coût est inconnu : identité couleur de la carte.
    if (!e.meta?.cost) for (const c of extractColors(e.meta?.colors)) candidates.add(c);
  }
  const present = MANA_COLORS.filter((c) => candidates.has(c));
  if (present.length <= 1) return { mainColors: [...present], splashColors: [] };

  const demand = pipDemandOf(spells, present);
  const total = present.reduce((s, c) => s + demand[c], 0);
  if (total <= 0) return { mainColors: [...present], splashColors: [] };

  const mainColors: string[] = [];
  const splashColors: string[] = [];
  for (const c of present) {
    if (demand[c] <= 0) continue;
    const share = demand[c] / total;
    if (share >= 0.12 || demand[c] >= 4) mainColors.push(c);
    else splashColors.push(c);
  }
  // Toujours au moins une couleur principale (deck quasi mono-splash).
  if (mainColors.length === 0 && splashColors.length > 0) {
    const best = [...splashColors].sort((a, b) => demand[b] - demand[a])[0];
    mainColors.push(best);
    splashColors.splice(splashColors.indexOf(best), 1);
  }
  return { mainColors, splashColors };
};

/** Compositions de `total` en `k` parts (récursif, k ≤ 5 et total ≤ 18 ici). */
const forEachComposition = (k: number, total: number, fn: (parts: number[]) => void): void => {
  const parts = new Array<number>(k).fill(0);
  const walk = (idx: number, left: number) => {
    if (idx === k - 1) { parts[idx] = left; fn(parts); return; }
    for (let x = 0; x <= left; x++) { parts[idx] = x; walk(idx + 1, left - x); }
  };
  walk(0, total);
};

/**
 * Suggère les terres de base d'un deck en construction.
 *
 * @param deck   quantités par nom de carte (sorts ET terres non-base ajoutées)
 * @param meta   méta par nom de carte (coût, cmc, type, production de mana)
 * @param opts   `deckSize` (défaut 40) et `maxLands` (défaut 18)
 */
export function suggestBasicLands(
  deck: Record<string, number>,
  meta: Record<string, ManaCardMeta>,
  opts: { deckSize?: number; maxLands?: number } = {},
): AutoLandsResult {
  const deckSize = opts.deckSize ?? 40;
  const maxLands = opts.maxLands ?? 18;

  const emptyBasics = (): Record<string, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0 });

  const entries: DeckEntry[] = Object.entries(deck)
    .filter(([, qty]) => qty > 0)
    .map(([name, qty]) => ({ name, qty, meta: meta[name] }));

  const spells: DeckEntry[] = [];
  const nonBasicLands: DeckEntry[] = [];
  for (const e of entries) {
    if (BASIC_LAND_NAMES.has(e.name) || isLandType(e.meta?.type)) nonBasicLands.push(e);
    else spells.push(e);
  }
  const spellCount = spells.reduce((s, e) => s + e.qty, 0);
  const landsInDeck = nonBasicLands.reduce((s, e) => s + e.qty, 0);

  // Cible de terres : on complète jusqu'à 40, plafonné à `maxLands` pour ne pas
  // proposer 30 basics sur un deck encore à moitié vide.
  const totalLandTarget = Math.min(maxLands, Math.max(0, deckSize - spellCount));
  const basicsToAssign = Math.max(0, totalLandTarget - landsInDeck);

  const { mainColors, splashColors } = resolveDeckColors(spells);
  const allColors = [...mainColors, ...splashColors];
  const basics = emptyBasics();
  const base = {
    spellCount,
    mainColors,
    splashColors,
    totalLands: landsInDeck + basicsToAssign,
  };
  if (basicsToAssign === 0 || allColors.length === 0) {
    return { ...base, basics, totalLands: landsInDeck + basicsToAssign };
  }

  const isSplash = (c: string) => splashColors.includes(c);

  // ── Besoins par couleur : mélange robuste (médiane / Q3 / max) des exigences
  // Karsten de chaque carte, pour ne pas dimensionner sur le seul pire cas.
  const targetSources: Record<string, number> = {};
  for (const color of allColors) {
    const samples: number[] = [];
    for (const e of spells) {
      const pips = requiredPips(e.meta?.cost, color, allColors);
      if (pips <= 0) continue;
      const req = karstenRequiredSources(pips, e.meta?.cmc ?? 0, isSplash(color));
      for (let i = 0; i < e.qty; i++) samples.push(req);
    }
    if (samples.length === 0) { targetSources[color] = 0; continue; }
    samples.sort((a, b) => a - b);
    const n = samples.length;
    const median = samples[Math.floor((n - 1) * 0.5)];
    const q75 = samples[Math.floor((n - 1) * 0.75)];
    const maxReq = samples[n - 1];
    targetSources[color] = clamp(median * 0.35 + q75 * 0.5 + maxReq * 0.15, 0, totalLandTarget);
  }

  const demand = pipDemandOf(spells, allColors);

  // ── Sources déjà acquises : terres non-base du deck + producteurs de mana.
  const landSources: Record<string, number> = emptyBasics();
  for (const e of nonBasicLands) {
    if (isFetchLand(e.name)) {
      for (const c of allColors) landSources[c] += e.qty;
      continue;
    }
    const produced = extractColors(e.meta?.producedColours || e.meta?.colors || '');
    for (const c of produced) if (allColors.includes(c)) landSources[c] += e.qty;
  }
  const currentSources: Record<string, number> = { ...landSources };
  for (const e of spells) {
    if (!e.meta?.isManaProducer) continue;
    const produced = extractColors(e.meta.producedColours || '');
    const weight = nonLandSourceWeight(e.meta.cmc ?? 0);
    for (const c of produced) if (allColors.includes(c)) currentSources[c] += e.qty * weight;
  }

  // ── Planchers de terres pour l'accès early aux couleurs principales.
  const mainLandFloor: Record<string, number> = {};
  for (const c of mainColors) {
    let earlyDemand = 0;
    for (const e of spells) {
      const pips = requiredPips(e.meta?.cost, c, allColors);
      if (pips <= 0) continue;
      if ((e.meta?.cmc ?? 0) <= 3) earlyDemand += e.qty * Math.max(1, pips);
    }
    mainLandFloor[c] = earlyDemand > 0 ? Math.max(5, Math.ceil(4 + earlyDemand * 0.45)) : 4;
  }
  // Planchers infaisables (deck 3 couleurs, peu de basics) : on les relâche.
  const minNeeded = () =>
    mainColors.reduce((s, c) => s + Math.max(0, (mainLandFloor[c] || 0) - (landSources[c] || 0)), 0);
  while (minNeeded() > basicsToAssign) {
    const reducible = mainColors
      .filter((c) => (mainLandFloor[c] || 0) > 1)
      .sort((a, b) => (mainLandFloor[b] || 0) - (mainLandFloor[a] || 0));
    if (reducible.length === 0) break;
    mainLandFloor[reducible[0]] -= 1;
  }

  // ── Recherche exhaustive de la meilleure répartition des basics.
  const evaluate = (counts: number[]): number => {
    const sources: Record<string, number> = {};
    for (let i = 0; i < allColors.length; i++) {
      const c = allColors[i];
      sources[c] = (currentSources[c] || 0) + counts[i];
    }

    // 1) Déficit de sources par couleur (quadratique).
    let deficitPenalty = 0;
    for (const c of allColors) {
      const deficit = Math.max(0, (targetSources[c] || 0) - sources[c]);
      deficitPenalty += deficit * deficit;
    }

    // 2) Castabilité carte par carte, pondérée par le CMC (les 2-drops d'abord).
    let castabilityPenalty = 0;
    for (const e of spells) {
      let hasRequirement = false;
      let adequacy = 1;
      for (const c of allColors) {
        const pips = requiredPips(e.meta?.cost, c, allColors);
        if (pips <= 0) continue;
        hasRequirement = true;
        const req = karstenRequiredSources(pips, e.meta?.cmc ?? 0, isSplash(c));
        adequacy *= req > 0 ? clamp(sources[c] / req, 0, 1) : 1;
      }
      if (!hasRequirement) continue;
      const cmc = e.meta?.cmc ?? 0;
      const cmcWeight = cmc <= 2 ? 1.7 : cmc === 3 ? 1.3 : cmc === 4 ? 1.0 : 0.7;
      castabilityPenalty += (1 - adequacy) ** 2 * cmcWeight * e.qty;
    }

    // 3) Équilibre des couleurs principales vs part de demande en pips.
    let balancePenalty = 0;
    if (mainColors.length >= 2) {
      const demandTotal = mainColors.reduce((s, c) => s + (demand[c] || 0), 0);
      const sourceTotal = mainColors.reduce((s, c) => s + sources[c], 0);
      if (demandTotal > 0 && sourceTotal > 0) {
        for (const c of mainColors) {
          const demandShare = (demand[c] || 0) / demandTotal;
          const sourceShare = sources[c] / sourceTotal;
          balancePenalty += (sourceShare - demandShare) ** 2;
        }
      }
      for (let i = 0; i < mainColors.length; i++) {
        for (let j = i + 1; j < mainColors.length; j++) {
          const diff = Math.abs(sources[mainColors[i]] - sources[mainColors[j]]);
          if (diff > 3) balancePenalty += (diff - 3) ** 2 * 0.35;
        }
      }
    }

    // 4) Splash sans aucune source, et planchers early non tenus.
    // Le coût d'un splash à 0 source croît avec sa demande réelle : une carte
    // splash jouée pour de vrai mérite sa terre, un pip anecdotique non.
    let structurePenalty = 0;
    for (const c of splashColors) {
      const splashDemand = demand[c] || 0;
      if (splashDemand > 0 && (landSources[c] || 0) + counts[allColors.indexOf(c)] <= 0) {
        structurePenalty += 1.2 + 1.6 * splashDemand;
      }
    }
    for (const c of mainColors) {
      const floor = mainLandFloor[c] || 0;
      if (floor <= 0) continue;
      const fromLands = (landSources[c] || 0) + counts[allColors.indexOf(c)];
      const deficit = Math.max(0, floor - fromLands);
      structurePenalty += deficit * deficit * 40;
    }

    return deficitPenalty + castabilityPenalty * 2.6 + balancePenalty * 6 + structurePenalty;
  };

  let bestObj = Number.POSITIVE_INFINITY;
  let bestComp: number[] = new Array(allColors.length).fill(0);
  forEachComposition(allColors.length, basicsToAssign, (parts) => {
    const obj = evaluate(parts);
    if (obj < bestObj - 1e-9) { bestObj = obj; bestComp = [...parts]; }
  });

  for (let i = 0; i < allColors.length; i++) basics[allColors[i]] = bestComp[i];
  return { ...base, basics };
}
