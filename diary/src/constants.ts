import type { EventType, NoteSection } from './types'

/** Formats Arena, groupés par type d'événement. */
export const FORMATS_BY_TYPE: Record<EventType, string[]> = {
  draft: ['PremierDraft', 'TradDraft'],
  sealed: ['Sealed', 'ArenaDirect_Sealed'],
}

export const FORMAT_LABELS: Record<string, string> = {
  PremierDraft: 'Premier Draft',
  TradDraft: 'Traditional Draft',
  Sealed: 'Sealed',
  ArenaDirect_Sealed: 'Arena Direct',
}

/**
 * Nombre de victoires qui vaut trophee, par format.
 *
 * Un trophee n'est pas 7 victoires partout : en Traditional (BO3) la course
 * s'arrete a 3-0. Compter 7 partout rendrait les trophees Trad invisibles.
 */
export const TROPHY_WINS: Record<string, number> = {
  PremierDraft: 7,
  Sealed: 7,
  TradDraft: 3,
  TradSealed: 3,
  ArenaDirect_Sealed: 7,
}

export const DEFAULT_TROPHY_WINS = 7

export const trophyThreshold = (format: string): number =>
  TROPHY_WINS[format] ?? DEFAULT_TROPHY_WINS

/**
 * Aplat d'un score, EN PROPORTION du seuil de trophée du format : un 3-0 en
 * Traditional est un trophée, pas un score moyen.
 *
 * Partagé par la carte d'événement et la bande de forme du bilan — deux
 * endroits qui montrent le même score et doivent le teinter pareil.
 */
export const scoreTone = (wins: number, format: string): string => {
  const ratio = trophyThreshold(format) > 0 ? wins / trophyThreshold(format) : 0
  if (ratio >= 1) return 'bg-trophy text-white'
  if (ratio >= 0.66) return 'bg-brand text-ink'
  if (ratio >= 0.4) return 'bg-warn text-ink'
  return 'bg-loss-soft text-ink'
}

/** Les formats Traditional se jouent en BO3 : le score en matchs masque les parties. */
export const isBestOfThree = (format: string): boolean =>
  format.startsWith('Trad')

/**
 * Sections de commentaire. Seule la première diffère entre draft et sealed :
 * on juge la phase de pick d'un côté, le choix de deck de l'autre.
 */
const SHARED_SECTIONS: NoteSection[] = [
  {
    key: 'deck_quality',
    label: 'Bilan qualité du deck construit',
    placeholder: 'Courbe, ratio créatures/sorts, plan de jeu, cartes limites…',
  },
  {
    key: 'gameplay',
    label: 'Erreurs et réussites en phase de jeu',
    placeholder: 'Mulligans, séquençage, blocages, sideboard…',
  },
  {
    key: 'overperformers',
    label: 'Overperformers',
    placeholder: 'Cartes qui ont fait mieux que prévu, et pourquoi.',
  },
  {
    key: 'underperformers',
    label: 'Underperformers',
    placeholder: 'Cartes décevantes, à réévaluer au prochain draft.',
  },
  {
    key: 'other',
    label: 'Autres commentaires',
    placeholder: 'Tout ce qui ne rentre pas ailleurs.',
  },
]

export const SECTIONS_BY_TYPE: Record<EventType, NoteSection[]> = {
  draft: [
    {
      key: 'pick_phase',
      label: 'Bilan phase de pick',
      placeholder: 'Lecture des signaux, moment du commit, picks regrettés…',
    },
    ...SHARED_SECTIONS,
  ],
  sealed: [
    {
      key: 'deck_choice',
      label: 'Bilan choix de deck',
      placeholder: 'Couleurs envisagées, build écarté, pourquoi ce choix…',
    },
    ...SHARED_SECTIONS,
  ],
}
