import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Hand } from 'lucide-react'
import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import { usePicks } from '../queries/usePicks'
import type { DiaryPick } from '../types'

interface Props {
  eventId: string
  /** Le panneau ne charge qu'une fois la carte dépliée. */
  active: boolean
}

/**
 * Revue de la phase de pick, calquée sur Draft Practice : on rejoue pack par
 * pack, la carte prise est mise en avant et le reste du pack grisé — c'est ce
 * qu'on a laissé passer qui est instructif.
 *
 * Les visuels Magic sont posés sur une plaque sombre : ils sont dessinés pour
 * du fond noir, le crème les délaverait.
 */
export function PickPanel({ eventId, active }: Props) {
  const { data: picks, isLoading, error } = usePicks(eventId, active)
  const [index, setIndex] = useState(0)

  const current: DiaryPick | undefined = picks?.[index]

  // Pool constitué jusqu'au pick affiché, pour le bandeau du bas.
  const poolSoFar = useMemo(
    () =>
      (picks ?? [])
        .slice(0, index + 1)
        .map((p) => p.picked_card)
        .filter((n): n is string => Boolean(n)),
    [picks, index],
  )

  if (isLoading) {
    return <Shell>Chargement des picks…</Shell>
  }
  if (error) {
    return <Shell tone="error">Picks illisibles : {String(error)}</Shell>
  }
  if (!picks?.length) {
    return <Shell>Aucun pick enregistré — l'overlay n'a pas tourné pendant ce draft.</Shell>
  }
  if (!current) return null

  const packCards = current.pack_cards ?? []

  return (
    <section className="well p-3.5">
      {/* Navigation */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised">
          <Hand size={13} strokeWidth={2.5} />
        </span>
        <h3 className="h-card">Phase de pick</h3>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Pick précédent"
            className="btn-icon"
          >
            <ChevronLeft size={14} strokeWidth={3} />
          </button>
          <span className="min-w-[70px] text-center font-display text-base font-black tabular-nums">
            P{current.pack_number}P{current.pick_number}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(picks.length - 1, i + 1))}
            disabled={index === picks.length - 1}
            aria-label="Pick suivant"
            className="btn-icon"
          >
            <ChevronRight size={14} strokeWidth={3} />
          </button>
          <span className="pill-soft">
            {index + 1} / {picks.length}
          </span>
        </div>
      </div>

      {/* Timeline cliquable */}
      <div className="mb-3 flex flex-wrap gap-0.5">
        {picks.map((pick, i) => (
          <button
            key={pick.id}
            onClick={() => setIndex(i)}
            title={`P${pick.pack_number}P${pick.pick_number} · ${pick.picked_card ?? '?'}`}
            className={`h-2 min-w-[6px] flex-1 rounded-full border border-ink transition ${
              i === index
                ? 'bg-brand-ink'
                : i < index
                  ? 'bg-brand'
                  : 'bg-paper-raised hover:bg-brand-soft'
            }`}
          />
        ))}
      </div>

      {/* Le pack, sur plaque sombre */}
      <div className="plate p-2.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-7"
          >
            {packCards.map((card, i) => {
              const picked = card.arenaId === current.picked_arena_id
              const name = card.name ?? null

              return (
                <motion.div
                  key={`${card.arenaId}-${i}`}
                  whileHover={{ y: -4, scale: 1.03 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                  title={name ?? `#${card.arenaId}`}
                  className={`relative aspect-[63/88] overflow-hidden rounded-lg bg-black ${
                    picked
                      ? 'border-2 border-brand ring-2 ring-brand/50'
                      : 'border border-white/15 opacity-40 saturate-50'
                  }`}
                >
                  {name ? (
                    <CardImage
                      src={getCardImage(name)}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] text-white/40">
                      #{card.arenaId}
                    </div>
                  )}

                  {picked && (
                    <span className="micro absolute left-1 top-1 rounded border border-ink bg-brand px-1 py-0.5 text-ink">
                      pick
                    </span>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {/* Pool à cet instant */}
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto py-1">
          <span className="micro shrink-0 text-white/50">Pool {poolSoFar.length}</span>
          {poolSoFar.slice(-24).map((name, i) => (
            <CardImage
              key={`${name}-${i}`}
              src={getCardImage(name)}
              alt={name}
              title={name}
              className="h-9 w-[26px] shrink-0 rounded border border-white/20 object-cover"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Shell({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'error'
}) {
  return (
    <div className={`p-3.5 ${tone === 'error' ? 'rounded-xl border-2 border-ink bg-loss-soft' : 'well'}`}>
      <p className="text-sm font-semibold text-ink-soft">{children}</p>
    </div>
  )
}
