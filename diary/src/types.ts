// ─── Types du journal ────────────────────────────────────────────────────────
// Miroir des tables diary_* (voir sql/001_diary_schema.sql).

export type EventType = 'draft' | 'sealed'
export type EventSource = 'manual' | 'overlay'

export interface DiaryEvent {
  id: string
  set_code: string
  format: string
  event_type: EventType
  played_at: string
  wins: number
  losses: number
  source: EventSource
  draft_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DiaryDeckVersion {
  id: string
  event_id: string
  version_no: number
  label: string | null
  decklist_raw: string
  created_at: string
}

export interface DiaryNote {
  id: string
  event_id: string
  section: string
  body: string
  updated_at: string
}

export interface DiaryPick {
  id: string
  event_id: string
  pack_number: number
  pick_number: number
  picked_card: string | null
  picked_arena_id: number | null
  pack_cards: { arenaId?: number; name?: string }[]
}

export interface DiaryPoolCard {
  id: string
  event_id: string
  card_name: string
  qty: number
}

export interface DiaryMatch {
  id: string
  event_id: string
  match_id: string
  match_number: number | null
  opponent_name: string | null
  /** Couleurs déduites des cartes adverses vues en jeu, ex "UB". */
  opponent_colors: string | null
  games_won: number
  games_lost: number
  won: boolean | null
}

/** Un événement avec tout ce qui lui est rattaché, tel que consommé par l'UI. */
export interface DiaryEventDetail extends DiaryEvent {
  deckVersions: DiaryDeckVersion[]
  notes: Record<string, string>
  poolCards: DiaryPoolCard[]
  matches: DiaryMatch[]
  pickCount: number
}

/** Définition d'une section de commentaire qualitatif. */
export interface NoteSection {
  key: string
  label: string
  placeholder: string
}
