// Types for MTG Limited App

export interface FormatOption {
  label: string;
  value: string;
  short: string;
}

export interface ColorPair {
  code: string;
  name: string;
}

export interface Deck {
  id: string | number;
  name: string;
  colors: string;
  wr: number;
  games: number;
  type: string;
  history: number[];
}

export interface Card {
  id: string | number;
  name: string;
  rarity: string;
  colors: string;
  gih_wr: number | null;
  alsa: number | null;
  img_count?: number;
}

export interface ArchCard extends Card {
  card_name: string;
  global_wr: number | null;
  global_alsa: number | null;
  filter_context?: string;
}

export interface Article {
  id: string | number;
  title: string;
  summary: string;
  thumbnail_url?: string;
  video_url?: string;
  source_url: string;
  source_name: string;
  published_at: string;
  tags?: string[];
  set_tag?: string;
  strategic_score?: number;
  mentioned_cards?: string | string[];
}

export interface CrossPerformance {
  deckName: string;
  deckColors: string;
  deckWr: number;
  cardWr: number;
  avgCardWr: number;
}

export interface ComparisonData {
  card_name?: string;
  filter_context?: string;
  rarity?: string;
  colors?: string;
  [key: string]: string | number | null | undefined;
}

export interface SortConfig {
  key: string;
  dir: 'asc' | 'desc';
}

export interface GradeResult {
  letter: string;
  color: string;
}

// Component Props
export interface ManaIconsProps {
  colors: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  isSplash?: boolean;
}

export interface MetagamePieChartProps {
  decks: Deck[];
  totalGames: number;
  globalMeanWR?: number;
}

export interface PairBreakdownChartProps {
  decks: Deck[];
}

export interface SparklineProps {
  data: number[];
  color?: string;
}

export interface SwipeableOverlayProps {
  onClose: () => void;
  children: React.ReactNode;
}

export interface ArchetypeDashboardProps {
  deck: Deck;
  activeFormat: string;
  activeSet: string;
  globalMeanWR: number;
  totalGames: number;
  onClose: () => void;
  onCardClick: (card: Card) => void;
}

export interface CardDetailOverlayProps {
  card: Card;
  activeFormat: string;
  activeSet: string;
  decks: Deck[];
  cards: Card[];
  onClose: () => void;
  onCardSelect?: (card: Card) => void;
}

export interface FormatComparisonProps {
  activeSet: string;
}

export interface PressReviewProps {
  activeSet: string;
}

export interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}
