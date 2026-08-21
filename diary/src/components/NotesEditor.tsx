import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section) => (
        <NoteField
          key={section.key}
          section={section}
          value={notes[section.key] ?? ''}
          onSave={onSave}
        />
      ))}
    </div>
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
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span
          className={`h-1.5 w-1.5 rounded-full ${filled ? 'bg-emerald-500' : 'bg-slate-700'}`}
          aria-hidden
        />
        {section.label}
        {state === 'saving' && <Loader2 size={12} className="animate-spin text-slate-500" />}
        {state === 'saved' && <Check size={12} className="text-emerald-500" />}
      </span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        placeholder={section.placeholder}
        className="min-h-[76px] resize-y rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
      />
    </label>
  )
}
