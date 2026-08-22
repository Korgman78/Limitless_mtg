import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, PenLine } from 'lucide-react'
import type { NoteSection } from '../types'

interface Props {
  sections: NoteSection[]
  notes: Record<string, string>
  onSave: (section: string, body: string) => Promise<void>
}

type SaveState = 'idle' | 'saving' | 'saved'

/**
 * Sections de commentaire qualitatif. Sauvegarde au blur plutôt qu'à chaque
 * frappe : on écrit des paragraphes ici, pas des champs courts.
 */
export function NotesEditor({ sections, notes, onSave }: Props) {
  const filled = sections.filter((s) => (notes[s.key] ?? '').trim()).length

  return (
    <section className="well p-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised">
          <PenLine size={13} strokeWidth={2.5} />
        </span>
        <h3 className="h-card">Débrief</h3>
        <span className="pill-soft ml-auto">
          {filled}/{sections.length}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
          <NoteField
            key={section.key}
            section={section}
            value={notes[section.key] ?? ''}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  )
}

function NoteField({
  section,
  value,
  onSave,
}: {
  section: NoteSection
  value: string
  onSave: (section: string, body: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<SaveState>('idle')
  const savedTimer = useRef<number | undefined>(undefined)

  // Resynchronise si la valeur serveur change hors de ce champ (refetch,
  // import overlay). On ne touche pas au brouillon en cours d'édition.
  useEffect(() => {
    setDraft((current) => (current === value ? current : value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => () => window.clearTimeout(savedTimer.current), [])

  const handleBlur = async () => {
    if (draft === value) return
    setState('saving')
    try {
      await onSave(section.key, draft)
      setState('saved')
      savedTimer.current = window.setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  const filled = draft.trim().length > 0

  return (
    <label className="flex flex-col gap-1.5">
      <span className="micro flex items-center gap-2 text-ink-soft">
        {/* La coche de la maquette : présent/absent, pas une jauge. */}
        <span
          className={`h-3 w-3 shrink-0 rounded-[4px] border-2 border-ink ${
            filled ? 'bg-brand' : 'bg-paper-raised'
          }`}
          aria-hidden
        />
        {section.label}
        {state === 'saving' && <Loader2 size={12} className="animate-spin text-ink-faint" />}
        {state === 'saved' && <Check size={12} strokeWidth={3} className="text-brand-ink" />}
      </span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        placeholder={section.placeholder}
        className="field min-h-[80px] resize-y leading-relaxed"
      />
    </label>
  )
}
