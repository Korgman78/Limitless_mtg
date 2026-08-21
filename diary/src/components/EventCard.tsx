import { useState } from 'react'
import { ChevronDown, Layers, Sparkles, Trash2 } from 'lucide-react'
import {
  FORMAT_LABELS,
  SECTIONS_BY_TYPE,
  isBestOfThree,
  trophyThreshold,
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
    <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <header className="flex items-center gap-4 p-4">
        <Score
          wins={event.wins}
          losses={event.losses}
          trophyAt={trophyThreshold(event.format)}
          onSave={(w, l) => onUpdateScore(event.id, w, l)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-slate-200">
              {FORMAT_LABELS[event.format] ?? event.format}
            </span>
            <span className="text-xs text-slate-500">{date}</span>
            {event.source === 'overlay' && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-400">
                overlay
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {event.event_type === 'draft' && (
              <span className="flex items-center gap-1">
                <Sparkles size={11} />
                {event.pickCount > 0
                  ? `${event.pickCount} picks`
                  : 'phase de pick non importée'}
              </span>
            )}
            {event.event_type === 'sealed' && (
              <span className="flex items-center gap-1">
                <Sparkles size={11} />
                {event.poolCards.length > 0
                  ? `pool de ${event.poolCards.reduce((n, c) => n + c.qty, 0)} cartes`
                  : 'pool non chargé'}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers size={11} />
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
            <span className={filledNotes === 0 ? 'text-amber-500/80' : ''}>
              {filledNotes}/{sections.length} sections commentées
            </span>
          </div>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          aria-label={open ? 'Replier' : 'Déplier'}
        >
          <ChevronDown
            size={18}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </header>

      {open && (
        <div className="space-y-4 border-t border-slate-800 p-4">
          <MatchesPanel matches={event.matches} format={event.format} />

          {event.event_type === 'draft' && (
            <PickPanel eventId={event.id} active={open} />
          )}

          <DeckPanel
            versions={event.deckVersions}
            setCode={event.set_code}
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
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Retirer cet événement du journal ?</span>
                <button
                  onClick={() => onDelete(event.id)}
                  className="rounded-md bg-red-900/60 px-2.5 py-1 font-medium text-red-200"
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-slate-500 hover:text-slate-300"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-slate-600 transition hover:text-red-400"
              >
                <Trash2 size={12} />
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
  trophyAt,
  onSave,
}: {
  wins: number
  losses: number
  /** Victoires valant trophée pour ce format : 3 en BO3, 7 en BO1. */
  trophyAt: number
  onSave: (wins: number, losses: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ wins, losses })

  // Palette calquée sur les grades de Limitless : violet pour le trophée,
  // dégradé vert → rouge ensuite. Le ton se calcule EN PROPORTION du seuil du
  // format : un 3-0 en Traditional est un trophée, pas un score moyen.
  const ratio = trophyAt > 0 ? wins / trophyAt : 0
  const tone =
    ratio >= 1
      ? 'border-purple-500 bg-purple-500/15 text-purple-300'
      : ratio >= 0.66
        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
        : ratio >= 0.4
          ? 'border-yellow-500 bg-yellow-500/15 text-yellow-300'
          : 'border-red-800 bg-red-900/20 text-red-300'

  const commit = async () => {
    setEditing(false)
    if (draft.wins !== wins || draft.losses !== losses) {
      await onSave(draft.wins, draft.losses)
    }
  }

  if (editing) {
    return (
      <div className="flex h-12 w-14 shrink-0 items-center gap-0.5 rounded-lg border border-slate-600 bg-slate-900 px-1">
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
            className="w-full bg-transparent text-center text-base font-bold tabular-nums text-slate-100 focus:outline-none"
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
      className={`flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border text-lg font-bold tabular-nums transition hover:brightness-125 ${tone}`}
    >
      {wins}-{losses}
    </button>
  )
}
