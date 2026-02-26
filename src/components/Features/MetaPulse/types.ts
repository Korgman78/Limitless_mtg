export interface SpotlightCard {
  name: string;
  rarity: string;
  gih_wr: number;
  wr_delta: number;
  alsa: number | null;
  alsa_delta: number | null;
  trophy_freq: number | null;
  trophy_freq_delta: number | null;
  score: number;
}

export interface MovingArchetype {
  name: string;
  colors: string;
  wr: number;
  wr_delta: number;
  games: number;
  games_delta: number;
  meta_share: number;
}

export interface TrophyMover {
  name: string;
  freq: number;
  delta: number;
  archetype: string;
}

export interface PulseSynergy {
  card_a: string;
  card_b: string;
  lift: number;
  archetype: string;
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
    archetype_delta: number;
    color_delta: number;
  };
  cards_spotlight: {
    rising: SpotlightCard[];
    falling: SpotlightCard[];
  };
  moving_archetypes: {
    rising: MovingArchetype[];
    falling: MovingArchetype[];
  };
  trophy_movers?: {
    gaining: TrophyMover[];
    losing: TrophyMover[];
  };
  synergies?: PulseSynergy[];
}
