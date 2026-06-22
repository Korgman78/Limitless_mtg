export const queryKeys = {
  sets: ['sets'] as const,
  decks: (set: string, format: string) => ['decks', set, format] as const,
  cards: (set: string, format: string, archetype: string) =>
    ['cards', set, format, archetype] as const,
  cardImages: (set: string) => ['cardImages', set] as const,
  formatPivots: (set: string, format: string) =>
    ['formatPivots', set, format] as const,
  archetypeCards: (set: string, format: string, colors: string) =>
    ['archetypeCards', set, format, colors] as const,
  cardCrossPerf: (set: string, format: string, cardName: string) =>
    ['cardCrossPerf', set, format, cardName] as const,
  formatComparison: (set: string, mode: string) =>
    ['formatComparison', set, mode] as const,
  playerLevelComparison: (set: string, format: string) =>
    ['playerLevelComparison', set, format] as const,
  articles: (setFilter: string) => ['articles', setFilter] as const,
  article: (id: string | number) => ['article', id] as const,
  formatBalance: (set: string) => ['formatBalance', set] as const,
  skeletons: (set: string, format: string) => ['skeletons', set, format] as const,
  cardSynergies: (set: string, format: string, cardName: string) =>
    ['cardSynergies', set, format, cardName] as const,
  metagamePulse: (set: string, format: string, window: string) =>
    ['metagamePulse', set, format, window] as const,
  trophyDeckMap: (set: string, format: string) =>
    ['trophyDeckMap', set, format] as const,
  trophyDeck: (aggregateId: string) =>
    ['trophyDeck', aggregateId] as const,
  cardMap: (set: string, format: string) =>
    ['cardMap', set, format] as const,
  draftPracticeList: (set: string, format: string) =>
    ['draftPracticeList', set, format] as const,
  draftPractice: (aggregateId: string) =>
    ['draftPractice', aggregateId] as const,
  formatSynergies: (set: string, format: string) =>
    ['formatSynergies', set, format] as const,
}
