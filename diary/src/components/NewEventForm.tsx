import { useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { parseMtgaDeck } from '@limitless/utils/deckAnalysisCore'
import { FORMATS_BY_TYPE, FORMAT_LABELS } from '../constants'
import type { EventType } from '../types'
import type { NewEventInput } from '../queries/useDiaryMutations'

interface Props {
  setCode: string
  onSubmit: (input: NewEventInput) => Promise<void>
  onCancel: () => void
}

const todayLocal = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

export function NewEventForm({ setCode, onSubmit, onCancel }: Props) {
  const [eventType, setEventType] = useState<EventType>('draft')
  const [format, setFormat] = useState('PremierDraft')
  const [playedAt, setPlayedAt] = useState(todayLocal())
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [decklist, setDecklist] = useState('')
  const [pool, setPool] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTypeChange = (type: EventType) => {
    setEventType(type)
    setFormat(FORMATS_BY_TYPE[type][0])
  }

  const poolPreview = pool.trim() ? parseMtgaDeck(pool) : null

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        set_code: setCode,
        format,
        event_type: eventType,
        // On stocke un timestamp : midi local évite les décalages de fuseau
        // qui feraient basculer l'événement au jour précédent.
        played_at: new Date(`${playedAt}T12:00:00`).toISOString(),
        wins,
        losses,
        decklist_raw: decklist,
        poolCards:
          eventType === 'sealed' && poolPreview
            ? poolPreview.mainCards.concat(poolPreview.sideboardCards)
            : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-tint space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised">
          <FilePlus2 size={13} strokeWidth={2.5} />
        </span>
        <h2 className="h-card">Nouvelle entrée</h2>
        <span className="pill-ink ml-auto">{setCode}</span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Type">
          <div className="flex gap-1.5">
            {(['draft', 'sealed'] as EventType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={`capitalize ${
                  eventType === type ? 'pill-brand shadow-brut-sm' : 'pill-soft text-ink-soft'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Format">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="field font-bold"
          >
            {FORMATS_BY_TYPE[eventType].map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f] ?? f}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="field font-bold"
          />
        </Field>

        <Field label="Score">
          <div className="flex items-center gap-1.5">
            <NumberInput value={wins} onChange={setWins} max={12} />
            <span className="font-display text-lg font-black text-ink-faint">–</span>
            <NumberInput value={losses} onChange={setLosses} max={6} />
          </div>
        </Field>
      </div>

      {eventType === 'sealed' && (
        <Field label="Pool complet (export MTGA)">
          <textarea
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            rows={4}
            placeholder="Arena ne logue pas le pool sealed : colle-le ici depuis l'export MTGA"
            className="field-mono"
          />
          {poolPreview && (
            <span className="micro text-brand-ink">
              {poolPreview.totalMainCards + poolPreview.totalSideboardCards} cartes
              reconnues
            </span>
          )}
        </Field>
      )}

      <Field label="Deck construit (export MTGA)">
        <textarea
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          rows={4}
          placeholder="Optionnel — tu pourras l'ajouter plus tard"
          className="field-mono"
        />
      </Field>

      {error && (
        <p className="rounded-xl border-2 border-ink bg-loss-soft px-3 py-2 text-sm font-bold">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={handleSubmit} disabled={busy} className="btn-primary">
          {busy ? 'Enregistrement…' : 'Créer l’entrée'}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Annuler
        </button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="micro text-brand-ink">{label}</span>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (n: number) => void
  max: number
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0)
      }}
      className="field w-16 text-center font-display text-lg font-black tabular-nums"
    />
  )
}
