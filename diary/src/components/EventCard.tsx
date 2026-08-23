import { useState } from 'react'
import { ChevronDown, Layers, Sparkles, Trash2 } from 'lucide-react'
import {
  FORMAT_LABELS,
  SECTIONS_BY_TYPE,
  isBestOfThree,
  scoreTone,
} from '../constants'
import type { DiaryEventDetail } from '../types'
import { DeckPanel } from './DeckPanel'
import { NotesEditor } from './NotesEditor'
import { MatchesPanel } from './MatchesPanel'
import { PickPanel } from './PickPanel'

interface Props {
  event: DiaryEventDetail
  onSaveNote: (eventId: string, section: string, body: string) => Promise<void>
  onAddDeckVersion: (
    eventId: string,
    versionNo: number,
    label: string,
    decklistRaw: string,
  ) => Promise<void>
  onDelete: (eventId: string) => Promise<void>
  onUpdateScore: (eventId: string, wins: number, losses: number) => Promise<void>
}

export function EventCard({
  event,
  onSaveNote,
  onAddDeckVersion,
  onDelete,
  onUpdateScore,
}: Props) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sections = SECTIONS_BY_TYPE[event.event_type]
  const filledNotes = sections.filter((s) => (event.notes[s.key] ?? '').trim()).length

  const date = new Date(event.played_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center gap-3.5 p-3.5">
        <Score
          wins={event.wins}
          losses={event.losses}
          format={event.format}
          onSave={(w, l) => onUpdateScore(event.id, w, l)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-base font-bold leading-none">
              {FORMAT_LABELS[event.format] ?? event.format}
            </span>
            <span className="micro text-ink-faint">{date}</span>
            {event.source === 'overlay' && (
              <span className="pill-brand">overlay</span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-soft">
            {event.event_type === 'draft' && (
              <span className="flex items-center gap-1">
                <Sparkles size={11} strokeWidth={2.5} />
                {event.pickCount > 0
                  ? `${event.pickCount} picks`
                  : 'phase de pick non importée'}
              </span>
            )}
            {event.event_type === 'sealed' && (
              <span className="flex items-center gap-1">
                <Sparkles size={11} strokeWidth={2.5} />
                {event.poolCards.length > 0
                  ? `pool de ${event.poolCards.reduce((n, c) => n + c.qty, 0)} cartes`
                  : 'pool non chargé'}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers size={11} strokeWidth={2.5} />
              {event.deckVersions.length > 0
                ? `${event.deckVersions.length} version${event.deckVersions.length > 1 ? 's' : ''}`
                : 'aucun deck'}
            </span>
            {isBestOfThree(event.format) && event.matches.length > 0 && (
              <span className="tabular-nums">
                {event.matches.reduce((n, m) => n + m.games_won, 0)}–
                {event.matches.reduce((n, m) => n + m.games_lost, 0)} en parties
              </span>
            )}
            {/* Les sections vides sont la seule alerte de la carte : elles
                signalent un événement joué mais jamais débriefé. */}
            <span
              className={
                filledNotes === 0
                  ? 'rounded-full bg-warn-soft px-2 py-0.5 text-ink'
                  : undefined
              }
            >
              {filledNotes}/{sections.length} sections commentées
            </span>
          </div>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-icon shrink-0"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </header>

      {open && (
        <div className="space-y-4 border-t-2 border-dashed border-ink/25 p-3.5">
          <MatchesPanel matches={event.matches} format={event.format} />

          {event.event_type === 'draft' && (
            <PickPanel eventId={event.id} active={open} />
          )}

          <DeckPanel
            versions={event.deckVersions}
            setCode={event.set_code}
            format={event.format}
            onAddVersion={(label, raw) =>
              onAddDeckVersion(
                event.id,
                (event.deckVersions.at(-1)?.version_no ?? 0) + 1,
                label,
                raw,
              )
            }
          />

          <NotesEditor
            sections={sections}
            notes={event.notes}
            onSave={(section, body) => onSaveNote(event.id, section, body)}
          />

          <div className="flex justify-end pt-1">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs font-bold text-ink-soft">
                  Retirer cet événement du journal ?
                </span>
                <button onClick={() => onDelete(event.id)} className="btn-danger px-3 py-1.5 text-xs">
                  Confirmer
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-bare">
                  Annuler
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-bare hover:text-loss">
                <Trash2 size={12} strokeWidth={2.5} />
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function Score({
  wins,
  losses,
  format,
  onSave,
}: {
  wins: number
  losses: number
  format: string
  onSave: (wins: number, losses: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ wins, losses })

  const commit = async () => {
    setEditing(false)
    if (draft.wins !== wins || draft.losses !== losses) {
      await onSave(draft.wins, draft.losses)
    }
  }

  if (editing) {
    return (
      <div className="flex h-14 w-16 shrink-0 items-center gap-0.5 rounded-xl border-2 border-ink bg-paper-raised px-1 shadow-brut-sm">
        {(['wins', 'losses'] as const).map((field) => (
          <input
            key={field}
            type="number"
            min={0}
            max={field === 'wins' ? 12 : 6}
            autoFocus={field === 'wins'}
            value={draft[field]}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [field]: Math.max(0, Number(e.target.value) || 0) }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') {
                setDraft({ wins, losses })
                setEditing(false)
              }
            }}
            onBlur={(e) => {
              // Ne valide que si le focus quitte le bloc score.
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
                void commit()
              }
            }}
            className="w-full bg-transparent text-center font-display text-lg font-black tabular-nums text-ink focus:outline-none"
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => {
        setDraft({ wins, losses })
        setEditing(true)
      }}
      title="Modifier le score"
      className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-ink font-display text-xl font-black shadow-brut-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${scoreTone(wins, format)}`}
    >
      {wins}-{losses}
    </button>
  )
}
