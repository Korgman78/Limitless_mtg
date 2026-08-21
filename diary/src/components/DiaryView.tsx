import { useEffect, useState } from 'react'
import { Archive, Plus } from 'lucide-react'
import { useDiarySets } from '../queries/useDiarySets'
import { useDiaryEvents } from '../queries/useDiaryEvents'
import {
  useAddDeckVersion,
  useCreateEvent,
  useDeleteEvent,
  useSaveNote,
  useUpdateEvent,
} from '../queries/useDiaryMutations'
import { EventCard } from './EventCard'
import { NewEventForm } from './NewEventForm'

/** Le journal : choix de l'extension, création d'entrée, liste des événements. */
export function DiaryView() {
  const { data: sets, isLoading: setsLoading, error: setsError } = useDiarySets()
  const [setCode, setSetCode] = useState<string | null>(null)
  const [showArchives, setShowArchives] = useState(false)
  const [creating, setCreating] = useState(false)

  // Extension par défaut : la première de la liste (les actives sont en tête).
  useEffect(() => {
    if (!setCode && sets?.length) setSetCode(sets[0].code)
  }, [sets, setCode])

  const { data: events, isLoading, error } = useDiaryEvents(setCode)

  const createEvent = useCreateEvent(setCode)
  const saveNote = useSaveNote(setCode)
  const addDeckVersion = useAddDeckVersion(setCode)
  const deleteEvent = useDeleteEvent(setCode)
  const updateEvent = useUpdateEvent(setCode)

  // Limitless marque beaucoup d'extensions comme actives : les afficher toutes
  // noierait celles ou tu joues vraiment. On garde celles qui ont des entrees,
  // plus la plus recente pour pouvoir en creer une premiere.
  const withEntries = sets?.filter((s) => s.entryCount > 0) ?? []
  const newestActive = sets?.find((s) => s.active)
  const primarySets =
    newestActive && !withEntries.some((s) => s.code === newestActive.code)
      ? [newestActive, ...withEntries]
      : withEntries

  const otherSets = (sets ?? []).filter(
    (s) => !primarySets.some((p) => p.code === s.code),
  )
  const visibleSets = showArchives ? [...primarySets, ...otherSets] : primarySets

  const record = (events ?? []).reduce(
    (acc, e) => ({ wins: acc.wins + e.wins, losses: acc.losses + e.losses }),
    { wins: 0, losses: 0 },
  )
  const total = record.wins + record.losses
  const winRate = total > 0 ? (record.wins / total) * 100 : null

  return (
    <div className="space-y-4">
      {/* Barre de contrôle propre au journal */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav className="flex flex-wrap items-center gap-1">
          {visibleSets.map((set) => (
            <button
              key={set.code}
              onClick={() => setSetCode(set.code)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                setCode === set.code
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              } ${set.active ? '' : 'opacity-70'}`}
            >
              {set.code}
              {set.entryCount > 0 && (
                <span className="ml-1.5 text-xs text-slate-600">{set.entryCount}</span>
              )}
            </button>
          ))}

          {otherSets.length > 0 && (
            <button
              onClick={() => setShowArchives((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 transition hover:text-slate-400"
            >
              <Archive size={12} />
              {showArchives ? 'Réduire' : `Autres extensions (${otherSets.length})`}
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {winRate !== null && (
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums text-slate-200">
                {winRate.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-600">
                {record.wins}–{record.losses} sur {events?.length ?? 0} events
              </div>
            </div>
          )}

          <button
            onClick={() => setCreating((v) => !v)}
            disabled={!setCode}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:opacity-40"
          >
            <Plus size={15} />
            Nouvelle entrée
          </button>
        </div>
      </div>

      {setsError && <ErrorBox error={setsError} />}
      {error && <ErrorBox error={error} />}

      {creating && setCode && (
        <NewEventForm
          setCode={setCode}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await createEvent.mutateAsync(input)
            setCreating(false)
          }}
        />
      )}

      {(setsLoading || isLoading) && (
        <p className="py-12 text-center text-sm text-slate-600">Chargement…</p>
      )}

      {!isLoading && events?.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-slate-800 py-14 text-center">
          <p className="text-slate-400">Aucune entrée pour {setCode}.</p>
          <p className="mt-1 text-sm text-slate-600">
            Commence par enregistrer ton dernier draft ou sealed.
          </p>
        </div>
      )}

      {events?.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onSaveNote={(eventId, section, body) =>
            saveNote.mutateAsync({ eventId, section, body })
          }
          onAddDeckVersion={(eventId, versionNo, label, decklistRaw) =>
            addDeckVersion.mutateAsync({ eventId, versionNo, label, decklistRaw })
          }
          onDelete={(eventId) => deleteEvent.mutateAsync(eventId)}
          onUpdateScore={(id, wins, losses) =>
            updateEvent.mutateAsync({ id, wins, losses }).then(() => undefined)
          }
        />
      ))}
    </div>
  )
}

function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  )
}
