import { useEffect } from 'react'
import { Flame, Trophy } from 'lucide-react'
import { useDiarySets } from '../queries/useDiarySets'
import { useDiaryEvents } from '../queries/useDiaryEvents'
import {
  useAddDeckVersion,
  useCreateEvent,
  useDeleteEvent,
  useSaveNote,
  useUpdateEvent,
} from '../queries/useDiaryMutations'
import { trophyThreshold } from '../constants'
import { EventCard } from './EventCard'
import { NewEventForm } from './NewEventForm'
import { WinRateDial } from './WinRateDial'
import { ActivityGrid } from './ActivityGrid'
import { CardTitle, ErrorBox } from './ui'

interface Props {
  setCode: string | null
  /** Remonte l'extension retenue par défaut, choisie ici car les sets sont chargés ici. */
  onSetCodeResolved: (code: string) => void
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}

/**
 * Le journal. En tête, le bilan de l'extension en cours — assiduité à gauche,
 * win rate en grand à droite ; en dessous, le flux des événements.
 *
 * Le choix d'extension et la création d'entrée vivent dans la barre latérale :
 * cette vue ne montre que des données.
 */
export function DiaryView({
  setCode,
  onSetCodeResolved,
  creating,
  onCreatingChange,
}: Props) {
  const { data: sets, isLoading: setsLoading, error: setsError } = useDiarySets()

  // Extension par défaut : la première de la liste (les actives sont en tête).
  useEffect(() => {
    if (!setCode && sets?.length) onSetCodeResolved(sets[0].code)
  }, [sets, setCode, onSetCodeResolved])

  const { data: events, isLoading, error } = useDiaryEvents(setCode)

  const createEvent = useCreateEvent(setCode)
  const saveNote = useSaveNote(setCode)
  const addDeckVersion = useAddDeckVersion(setCode)
  const deleteEvent = useDeleteEvent(setCode)
  const updateEvent = useUpdateEvent(setCode)

  const played = (events ?? []).filter((e) => e.wins + e.losses > 0)
  const wins = played.reduce((n, e) => n + e.wins, 0)
  const losses = played.reduce((n, e) => n + e.losses, 0)
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null
  const trophies = played.filter((e) => e.wins >= trophyThreshold(e.format)).length

  return (
    <div className="space-y-5">
      {setsError && <ErrorBox error={setsError} />}
      {error && <ErrorBox error={error} />}

      {/* Bandeau de tête : régularité à gauche, résultat à droite */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-5">
          <section className="card p-4">
            <CardTitle icon={<Flame size={13} strokeWidth={2.5} />} title="Assiduité">
              <span className="pill-ink">{events?.length ?? 0} entrées</span>
            </CardTitle>
            <div className="mt-4">
              <ActivityGrid dates={(events ?? []).map((e) => e.played_at)} />
            </div>
          </section>

          <section className="card grid grid-cols-2 divide-x-2 divide-ink">
            <Stat label="Trophées" value={String(trophies)} />
            <Stat
              label="Taux de trophée"
              value={played.length ? `${Math.round((trophies / played.length) * 100)}%` : '—'}
            />
          </section>
        </div>

        {/* Le héros : une seule grande surface colorée par écran */}
        <section className="card-tint flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="pill-ink">{setCode ?? '—'}</span>
            <span className="pill-soft ml-auto">
              <Trophy size={11} strokeWidth={3} />
              {trophies}
            </span>
          </div>

          <WinRateDial winRate={winRate} wins={wins} losses={losses} />

          <p className="micro text-center text-brand-ink">
            {played.length} événement{played.length > 1 ? 's' : ''} joué
            {played.length > 1 ? 's' : ''} · seuil de rentabilité à mi-cadran
          </p>
        </section>
      </div>

      {creating && setCode && (
        <NewEventForm
          setCode={setCode}
          onCancel={() => onCreatingChange(false)}
          onSubmit={async (input) => {
            await createEvent.mutateAsync(input)
            onCreatingChange(false)
          }}
        />
      )}

      {(setsLoading || isLoading) && (
        <p className="py-12 text-center text-sm font-bold text-ink-faint">Chargement…</p>
      )}

      {!isLoading && events?.length === 0 && !creating && (
        <div className="card border-dashed px-6 py-14 text-center shadow-none">
          <p className="font-display text-xl font-bold">Rien pour {setCode}.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Commence par enregistrer ton dernier draft ou sealed.
          </p>
        </div>
      )}

      {(events ?? []).length > 0 && (
        <div className="space-y-3">
          <span className="micro block text-ink-faint">Entrées</span>
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
              onUpdateScore={(id, w, l) =>
                updateEvent.mutateAsync({ id, wins: w, losses: l }).then(() => undefined)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="micro text-ink-faint">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-black leading-none">{value}</div>
    </div>
  )
}
