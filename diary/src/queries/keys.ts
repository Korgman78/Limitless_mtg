export const queryKeys = {
  sets: ['diary', 'sets'] as const,
  events: (setCode: string) => ['diary', 'events', setCode] as const,
  picks: (eventId: string) => ['diary', 'picks', eventId] as const,
}
