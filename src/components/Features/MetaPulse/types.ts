export interface PulseArchetype {
  name: string;
  colors: string;
  wr: number;
  delta: number;
  games?: number;
}

export interface PulseCard {
  name: string;
  rarity: string;
  gih_wr: number;
  delta: number;
  grade: string;
  alsa?: number;
  best_in?: string;
}

export interface PulseSynergy {
  card_a: string;
  card_b: string;
  lift: number;
  archetype: string;
}

export interface PulseTrophyTrends {
  total_trophies: number;
  top_archetypes: { name: string; count: number; delta: number }[];
  gaining_cards: { name: string; freq: number }[];
  losing_cards: { name: string; freq: number }[];
}

export interface PulseCommunityBuzz {
  title: string;
  source: string;
  sentiment_pct: number;
}

export interface MetaPulseData {
  version: number;
  type: string;
  generated_at: string;
  set_code: string;
  set_name: string;
  format: string;
  format_label: string;
  period: { from: string; to: string };
  total_games: number;
  format_health?: {
    archetype_score: number;
    color_score: number;
    classification: 'PRINCE' | 'BALANCED' | 'PAUPER';
  };
  card_of_the_week?: PulseCard & { best_archetype: string };
  archetypes: {
    top: PulseArchetype[];
    rising: PulseArchetype[];
    falling: PulseArchetype[];
  };
  cards: {
    stars: PulseCard[];
    falling: PulseCard[];
    sleepers: (PulseCard & { best_in?: string })[];
  };
  trophy_trends?: PulseTrophyTrends;
  synergies?: PulseSynergy[];
  community_buzz?: PulseCommunityBuzz[];
}
