import { useMemo, useState } from 'react'
import { Gauge, Layers, Plus, X } from 'lucide-react'
import { parseMtgaDeck } from '@limitless/utils/deckAnalysisCore'
import { CmcStack, type SkeletonCard } from '@limitless/components/Features/CmcStack'
import { useCardMeta } from '../queries/useCardMeta'
import { DeckScorePanel } from './DeckScorePanel'
import type { DiaryDeckVersion } from '../types'

interface Props {
  versions: DiaryDeckVersion[]
  setCode: string
  format: string
  onAddVersion: (label: string, decklistRaw: string) => Promise<void>
}

const MAX_CMC_COLUMN = 7

/**
 * Récap du deck en piles de courbe de mana, comme la tab Trophies. Les cartes
 * inconnues du set (terrains de base) sont regroupées à part plutôt qu'écartées
 * silencieusement.
 *
 * `CmcStack` vient de Limitless et suppose un fond sombre : on l'accueille sur
 * une plaque plutôt que de le redessiner pour le papier.
 */
export function DeckPanel({ versions, setCode, format, onAddVersion }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showScore, setShowScore] = useState(false)
  const { data: cardMeta } = useCardMeta(setCode)

  const selected =
    versions.find((v) => v.id === selectedId) ?? versions[versions.length - 1] ?? null

  const { columns, lands, unknown, total } = useMemo(() => {
    const empty = {
      columns: [] as { cmc: number; cards: SkeletonCard[] }[],
      lands: [] as SkeletonCard[],
      unknown: [] as string[],
      total: 0,
    }
    if (!selected) return empty

    const parsed = parseMtgaDeck(selected.decklist_raw)
    const buckets = new Map<number, SkeletonCard[]>()
    const landCards: SkeletonCard[] = []
    const missing: string[] = []
    let count = 0

    for (const entry of parsed.mainCards) {
      const meta = cardMeta?.get(entry.name)
      count += entry.qty

      if (!meta) {
        missing.push(entry.name)
        continue
      }

      const card: SkeletonCard = {
        name: entry.name,
        cmc: meta.cmc,
        type: meta.type,
        cost: '',
        rarity: meta.rarity,
      }

      // Les terrains n'ont pas de place sur une courbe de mana.
      if (meta.type.toLowerCase().includes('land')) {
        for (let i = 0; i < entry.qty; i++) landCards.push(card)
        continue
      }

      const bucket = Math.min(meta.cmc, MAX_CMC_COLUMN)
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      for (let i = 0; i < entry.qty; i++) buckets.get(bucket)!.push(card)
    }

    const maxCmc = Math.max(1, ...buckets.keys())
    const columns = Array.from({ length: maxCmc }, (_, i) => i + 1).map((cmc) => ({
      cmc,
      cards: buckets.get(cmc) ?? [],
    }))

    // Le CMC 0 n'existe quasiment jamais en Limited : on ne l'affiche que s'il y a du monde.
    if (buckets.get(0)?.length) columns.unshift({ cmc: 0, cards: buckets.get(0)! })

    return { columns, lands: landCards, unknown: missing, total: count }
  }, [selected, cardMeta])

  return (
    <section className="well p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised">
          <Layers size={13} strokeWidth={2.5} />
        </span>
        <h3 className="h-card">Deck</h3>

        {versions.map((version) => (
          <button
            key={version.id}
            onClick={() => setSelectedId(version.id)}
            className={
              selected?.id === version.id
                ? 'pill-brand shadow-brut-sm'
                : 'pill-soft text-ink-soft'
            }
          >
            v{version.version_no}
            {version.label ? ` · ${version.label}` : ''}
          </button>
        ))}

        {selected && <span className="micro text-ink-faint">{total} cartes</span>}

        <div className="ml-auto flex items-center gap-1.5">
          {selected && (
            <button
              onClick={() => setShowScore((v) => !v)}
              className={showScore ? 'pill-brand shadow-brut-sm' : 'pill-soft'}
            >
              <Gauge size={11} strokeWidth={3} />
              {showScore ? 'Masquer le score' : 'Score du deck'}
            </button>
          )}

          <button onClick={() => setAdding((v) => !v)} className="btn-bare">
            {adding ? <X size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={3} />}
            {adding ? 'Annuler' : 'Nouvelle version'}
          </button>
        </div>
      </div>

      {adding && (
        <AddVersionForm
          nextVersion={(versions.at(-1)?.version_no ?? 0) + 1}
          onSubmit={async (label, raw) => {
            await onAddVersion(label, raw)
            setAdding(false)
            setSelectedId(null)
          }}
        />
      )}

      {!selected && !adding && (
        <p className="text-sm font-semibold text-ink-soft">Aucun deck enregistré.</p>
      )}

      {selected && (
        <>
          <div className="plate flex items-start gap-1 overflow-x-auto p-2.5">
            {columns.map((column) => (
              <CmcStack
                key={column.cmc}
                cmc={column.cmc}
                cards={column.cards}
                onCardSelect={() => {}}
              />
            ))}
            {lands.length > 0 && (
              <CmcStack cmc={0} label="Lands" cards={lands} onCardSelect={() => {}} />
            )}
          </div>

          {showScore && (
            <DeckScorePanel
              setCode={setCode}
              format={format}
              decklistRaw={selected.decklist_raw}
            />
          )}

          {unknown.length > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-ink-faint">
              {unknown.length} carte{unknown.length > 1 ? 's' : ''} hors set, non
              affichée{unknown.length > 1 ? 's' : ''} : {unknown.join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function AddVersionForm({
  nextVersion,
  onSubmit,
}: {
  nextVersion: number
  onSubmit: (label: string, raw: string) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="mb-3 space-y-2 rounded-xl border-2 border-ink bg-paper-raised p-3">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={`Libellé (ex: "après 0-2") — défaut : Version ${nextVersion}`}
        className="field"
      />
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={5}
        placeholder="Colle ici l'export MTGA du deck"
        className="field-mono"
      />
      <button
        disabled={!raw.trim() || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onSubmit(label.trim(), raw)
            setLabel('')
            setRaw('')
          } finally {
            setBusy(false)
          }
        }}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        Enregistrer la version
      </button>
    </div>
  )
}
