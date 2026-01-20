export const queryKeys = {
  sets: ['sets'] as const,
  decks: (set: string, format: string) => ['decks', set, format] as const,
  cards: (set: string, format: string, archetype: string) =>
    ['cards', set, format, archetype] as const,
  archetypeCards: (set: string, format: string, colors: string) =>
    ['archetypeCards', set, format, colors] as const,
  cardCrossPerf: (set: string, format: string, cardName: string) =>
    ['cardCrossPerf', set, format, cardName] as const,
  formatComparison: (set: string, mode: string) =>
    ['formatComparison', set, mode] as const,
  articles: (setFilter: string) => ['articles', setFilter] as const,
  article: (id: string | number) => ['article', id] as const,
  formatBalance: (set: string) => ['formatBalance', set] as const,
}
