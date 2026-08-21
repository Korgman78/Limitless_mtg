import { useState } from 'react'
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
    <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Type">
          <div className="flex overflow-hidden rounded-lg border border-slate-800">
            {(['draft', 'sealed'] as EventType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={`px-3 py-1.5 text-sm capitalize transition ${
                  eventType === type
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-slate-900 text-slate-500 hover:text-slate-300'
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
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-sm focus:border-slate-600 focus:outline-none"
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
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-sm focus:border-slate-600 focus:outline-none"
          />
        </Field>

        <Field label="Score">
          <div className="flex items-center gap-1.5">
            <NumberInput value={wins} onChange={setWins} max={12} />
            <span className="text-slate-600">–</span>
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
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
          {poolPreview && (
            <span className="text-xs text-slate-500">
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
          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-xs placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
        />
      </Field>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:opacity-40"
        >
          {busy ? 'Enregistrement…' : 'Créer l’entrée'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
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
      className="w-14 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-sm tabular-nums focus:border-slate-600 focus:outline-none"
    />
  )
}
