import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      {/* Navigation */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Phase de pick
        </span>

        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            label="Pick précédent"
          >
            <ChevronLeft size={14} />
          </NavButton>
          <span className="min-w-[64px] text-center text-sm font-bold tabular-nums text-slate-200">
            P{current.pack_number}P{current.pick_number}
          </span>
          <NavButton
            onClick={() => setIndex((i) => Math.min(picks.length - 1, i + 1))}
            disabled={index === picks.length - 1}
            label="Pick suivant"
          >
            <ChevronRight size={14} />
          </NavButton>
        </div>

        <span className="text-[11px] text-slate-600">
          {index + 1} / {picks.length}
        </span>
      </div>

      {/* Timeline cliquable */}
      <div className="mb-3 flex flex-wrap gap-0.5">
        {picks.map((pick, i) => (
          <button
            key={pick.id}
            onClick={() => setIndex(i)}
            title={`P${pick.pack_number}P${pick.pick_number} · ${pick.picked_card ?? '?'}`}
            className={`h-1.5 flex-1 min-w-[6px] rounded-full transition ${
              i === index
                ? 'bg-indigo-400'
                : i < index
                  ? 'bg-slate-600'
                  : 'bg-slate-800 hover:bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Le pack */}
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
                className={`relative aspect-[63/88] overflow-hidden rounded-lg border bg-black ${
                  picked
                    ? 'border-indigo-400 ring-2 ring-indigo-400/60'
                    : 'border-slate-700/70 opacity-40 saturate-50'
                }`}
              >
                {name ? (
                  <CardImage
                    src={getCardImage(name)}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] text-slate-600">
                    #{card.arenaId}
                  </div>
                )}

                {picked && (
                  <span className="absolute left-1 top-1 rounded bg-indigo-500 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    pick
                  </span>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Pool à cet instant */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto py-1">
        <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-600">
          Pool {poolSoFar.length}
        </span>
        {poolSoFar.slice(-24).map((name, i) => (
          <CardImage
            key={`${name}-${i}`}
            src={getCardImage(name)}
            alt={name}
            title={name}
            className="h-9 w-[26px] shrink-0 rounded border border-slate-800 object-cover"
          />
        ))}
      </div>
    </div>
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <p className={`text-sm ${tone === 'error' ? 'text-red-400' : 'text-slate-600'}`}>
        {children}
      </p>
    </div>
  )
}

function NavButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md border border-slate-800 p-1 text-slate-400 transition hover:border-slate-600 hover:text-slate-200 disabled:opacity-30"
    >
      {children}
    </button>
  )
}
