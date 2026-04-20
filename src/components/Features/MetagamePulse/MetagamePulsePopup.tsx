import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Trophy, Activity, Layers, BarChart3 } from 'lucide-react'
import { useMetagamePulse, type PulseTimeWindow, type ArchetypePulseItem, type CardPulseItem, type TrophyPulseItem } from '../../../queries/useMetagamePulse'
import { ManaIcons } from '../../Common/ManaIcons'
import { Sparkline } from '../../Charts/Sparkline'
import { getCardImage } from '../../../utils/helpers'
import { Tooltip } from '../../Common/Tooltip'

// ── Time filter ─────────────────────────────────────────────────────────────

const TIME_OPTIONS: { value: PulseTimeWindow; label: string }[] = [
  { value: '3d', label: '3 Days' },
  { value: '1w', label: '1 Week' },
  { value: '3w', label: '3 Weeks' },
  { value: 'start', label: 'Since Start' },
]

// ── Infinite marquee carousel ──────────────────────────────────────────────
// Duplicates children so the strip is seamless. CSS animation scrolls
// the first copy off-screen, then resets instantly — creating a loop.
// Speed is deliberately slow (≈ 30-40s per cycle).

const InfiniteCarousel: React.FC<{ children: React.ReactNode; speed?: number }> = ({
  children,
  speed = 35,
}) => {
  const [isPaused, setIsPaused] = useState(false)

  return (
    <div
      className="overflow-hidden rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setTimeout(() => setIsPaused(false), 4000)}
    >
      <div
        className="flex gap-4 w-max carousel-track"
        style={{
          animationDuration: `${speed}s`,
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      >
        {/* Original set */}
        {children}
        {/* Duplicate for seamless loop */}
        {children}
      </div>

      <style>{`
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .carousel-track {
          animation: marquee-scroll linear infinite;
        }
      `}</style>
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────

const PulseSection: React.FC<{
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
  delay?: number
}> = ({ icon, title, subtitle, children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.35 }}
    className="space-y-3"
  >
    <div className="flex items-center gap-2.5">
      <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="text-[10px] text-slate-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </motion.div>
)

// ── Toggle pill ─────────────────────────────────────────────────────────────

const TogglePill: React.FC<{
  options: { value: string; label: string; icon?: React.ReactNode }[]
  value: string
  onChange: (v: string) => void
}> = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-lg bg-slate-800/80 border border-slate-700/50 p-0.5">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`flex items-center gap-1 px-3 py-1.5 md:px-2.5 md:py-1 rounded-md text-xs md:text-[11px] font-semibold transition-all min-h-[36px] md:min-h-0 ${
          value === opt.value
            ? 'bg-indigo-500/20 text-indigo-300 shadow-sm'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {opt.icon}
        {opt.label}
      </button>
    ))}
  </div>
)

// ── Archetype card ──────────────────────────────────────────────────────────

const ArchetypeCard: React.FC<{ item: ArchetypePulseItem; index: number; direction: 'rising' | 'falling' }> = ({
  item,
  index,
  direction,
}) => {
  const isRising = direction === 'rising'
  const deltaColor = isRising ? 'text-emerald-400' : 'text-red-400'
  const deltaBg = isRising ? 'bg-emerald-500/15' : 'bg-red-500/15'
  const borderColor = isRising ? 'border-emerald-500/20' : 'border-red-500/20'

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={`rounded-xl border ${borderColor} bg-slate-800/50 p-2 md:p-3 space-y-1.5 md:space-y-2.5 backdrop-blur-sm`}
    >
      <div className="flex items-center gap-1.5 md:gap-2">
        <ManaIcons colors={item.colors} size="sm" />
        <span className="text-[10px] md:text-xs font-semibold text-slate-200 truncate">{item.name}</span>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="text-sm md:text-lg font-black text-white tabular-nums">{item.wr.toFixed(1)}%</span>
        <span className={`inline-flex items-center gap-0.5 px-1 md:px-1.5 py-0.5 rounded-md text-[9px] md:text-xs font-bold ${deltaBg} ${deltaColor}`}>
          {isRising ? <TrendingUp size={8} className="md:hidden" /> : <TrendingDown size={8} className="md:hidden" />}
          {isRising ? <TrendingUp size={10} className="hidden md:block" /> : <TrendingDown size={10} className="hidden md:block" />}
          {item.wrDelta >= 0 ? '+' : ''}{item.wrDelta.toFixed(1)}
        </span>
      </div>

      {item.history.length > 1 && (
        <div className="flex justify-center">
          <Sparkline data={item.history} width={80} height={18} />
        </div>
      )}
    </motion.div>
  )
}

// ── Card item (bigger) ─────────────────────────────────────────────────────

const DELTA_TOOLTIPS = {
  wr: 'Win rate change (percentage points) over the selected period',
  alsa: 'Average Last Seen At change — lower = picked earlier in draft',
  trophy: 'Trophy deck frequency change (percentage points) over the selected period',
}

const CardItem: React.FC<{
  item: CardPulseItem
  index: number
  direction: 'rising' | 'falling'
  metric: 'wr' | 'alsa'
}> = ({ item, index, direction, metric }) => {
  const isRising = direction === 'rising'
  const deltaColor = isRising ? 'text-emerald-400' : 'text-red-400'
  const deltaBg = isRising ? 'bg-emerald-500/15' : 'bg-red-500/15'
  const borderColor = isRising ? 'border-emerald-500/20' : 'border-red-500/20'

  const displayValue = metric === 'wr' ? `${item.wr.toFixed(1)}%` : item.alsa != null ? `P${item.alsa.toFixed(1)}` : '-'
  const delta = metric === 'wr' ? item.wrDelta : item.alsaDelta
  const deltaLabel = metric === 'wr'
    ? `${delta != null && delta >= 0 ? '+' : ''}${delta?.toFixed(1) ?? '?'}pp`
    : `${delta != null && delta >= 0 ? '+' : ''}${delta?.toFixed(1) ?? '?'}`

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className={`flex-shrink-0 w-[220px] md:w-[250px] rounded-xl border ${borderColor} bg-slate-800/50 overflow-hidden backdrop-blur-sm`}
    >
      <div className="relative">
        <img
          src={getCardImage(item.name)}
          alt={item.name}
          className="w-full aspect-[488/680] object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-900 to-transparent" />
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-white tabular-nums">{displayValue}</span>
          <Tooltip content={<span className="text-[10px]">{DELTA_TOOLTIPS[metric]}</span>}>
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold cursor-help ${deltaBg} ${deltaColor}`}>
              {isRising ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {deltaLabel}
            </span>
          </Tooltip>
        </div>

        {item.wrHistory.length > 1 && (
          <div className="flex justify-center">
            <Sparkline data={item.wrHistory} width={200} height={22} />
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Trophy card ─────────────────────────────────────────────────────────────

const TrophyCard: React.FC<{ item: TrophyPulseItem; index: number; direction: 'gaining' | 'losing' }> = ({
  item,
  index,
  direction,
}) => {
  const isGaining = direction === 'gaining'
  const deltaColor = isGaining ? 'text-amber-400' : 'text-red-400'
  const borderColor = isGaining ? 'border-amber-500/20' : 'border-red-500/20'
  const Icon = isGaining ? TrendingUp : TrendingDown

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={`flex-shrink-0 w-[220px] md:w-[250px] rounded-xl border ${borderColor} bg-slate-800/50 overflow-hidden backdrop-blur-sm`}
    >
      <div className="relative">
        <img
          src={getCardImage(item.name)}
          alt={item.name}
          className="w-full aspect-[488/680] object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-900 to-transparent" />
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Trophy share</span>
          <span className="text-base font-bold text-white tabular-nums">
            {(item.freq * 100).toFixed(1)}%
          </span>
        </div>
        <Tooltip content={<span className="text-[10px]">{DELTA_TOOLTIPS.trophy}</span>}>
          <div className="flex items-center justify-end gap-1 cursor-help">
            <Icon size={11} className={deltaColor} />
            <span className={`text-sm font-bold ${deltaColor}`}>
              {item.delta > 0 ? '+' : ''}{(item.delta * 100).toFixed(1)}pp
            </span>
          </div>
        </Tooltip>
      </div>
    </motion.div>
  )
}

// ── Section shimmer (used per-section during refetch) ───────────────────────

const SectionShimmer: React.FC<{ height?: string }> = ({ height = 'h-[200px]' }) => (
  <div className="flex gap-4 animate-pulse">
    {[0, 1, 2].map((j) => (
      <div key={j} className={`flex-1 min-w-[220px] ${height} bg-slate-800/40 rounded-xl`} />
    ))}
  </div>
)

// ── Full loading skeleton (first load only) ─────────────────────────────────

const PulseSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    {[0, 1, 2].map((i) => (
      <div key={i} className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-slate-800 rounded-lg" />
          <div className="space-y-1">
            <div className="h-3.5 w-32 bg-slate-800 rounded" />
            <div className="h-2.5 w-44 bg-slate-800/60 rounded" />
          </div>
        </div>
        <div className="flex gap-4">
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex-1 min-w-[220px] h-[200px] bg-slate-800/40 rounded-xl" />
          ))}
        </div>
      </div>
    ))}
  </div>
)

// ── Empty state ─────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center py-6 text-xs text-slate-600">
    No {label} data for this time window.
  </div>
)

// ── Main popup ──────────────────────────────────────────────────────────────

interface Props {
  activeSet: string
  activeFormat: string
}

export const MetagamePulsePopup: React.FC<Props> = ({ activeSet, activeFormat }) => {
  const [timeWindow, setTimeWindow] = useState<PulseTimeWindow>('1w')
  const [archDirection, setArchDirection] = useState<'rising' | 'falling'>('rising')
  const [cardDirection, setCardDirection] = useState<'rising' | 'falling'>('rising')
  const [cardMetric, setCardMetric] = useState<'wr' | 'alsa'>('wr')
  const [trophyDirection, setTrophyDirection] = useState<'gaining' | 'losing'>('gaining')

  const isDraft = activeFormat === 'PremierDraft' || activeFormat === 'TradDraft'

  const { data, isLoading, isFetching } = useMetagamePulse(activeSet, activeFormat, timeWindow)
  const isRefetching = isFetching && !isLoading // has old data but fetching new

  const archetypes = data?.archetypes[archDirection] || []
  const cards =
    cardMetric === 'wr'
      ? (cardDirection === 'rising' ? data?.cards.risingByWr : data?.cards.fallingByWr) || []
      : (cardDirection === 'rising' ? data?.cards.risingByAlsa : data?.cards.fallingByAlsa) || []

  const trophyMovers = data?.trophyMovers[trophyDirection] || []

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-y-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-950/95 via-slate-900/95 to-purple-950/95 backdrop-blur-md px-5 py-4 border-b border-indigo-500/20">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Metagame Pulse</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Live trends in archetypes, cards & trophy decks
              </p>
            </div>
          </div>

          {/* Time filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTimeWindow(opt.value)}
                className={`px-3.5 py-2 md:px-3 md:py-1.5 rounded-lg text-xs md:text-[11px] font-bold transition-all min-h-[38px] md:min-h-0 ${
                  timeWindow === opt.value
                    ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                    : 'bg-slate-800/60 text-slate-500 border border-slate-700/40 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-6 space-y-8 max-w-3xl mx-auto w-full">
        {isLoading ? (
          <PulseSkeleton />
        ) : (
          <>
            {/* ── Archetypes Pulse ─────────────────────────────────── */}
            <PulseSection
              icon={<Layers size={16} className="text-indigo-400" />}
              title="Archetypes Pulse"
              subtitle="Biggest win rate movers"
              delay={0}
            >
              <div className="flex items-center gap-2 mb-1">
                <TogglePill
                  value={archDirection}
                  onChange={(v) => setArchDirection(v as 'rising' | 'falling')}
                  options={[
                    { value: 'rising', label: 'Rising', icon: <TrendingUp size={10} /> },
                    { value: 'falling', label: 'Falling', icon: <TrendingDown size={10} /> },
                  ]}
                />
              </div>
              {isRefetching ? (
                <SectionShimmer height="h-[130px]" />
              ) : archetypes.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {archetypes.map((a, i) => (
                    <ArchetypeCard key={a.colors} item={a} index={i} direction={archDirection} />
                  ))}
                </div>
              ) : (
                <EmptyState label="archetype" />
              )}
            </PulseSection>

            {/* ── Cards Pulse ──────────────────────────────────────── */}
            <PulseSection
              icon={<BarChart3 size={16} className="text-indigo-400" />}
              title="Cards Pulse"
              subtitle="Top common/uncommon movers"
              delay={0.08}
            >
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <TogglePill
                  value={cardDirection}
                  onChange={(v) => setCardDirection(v as 'rising' | 'falling')}
                  options={[
                    { value: 'rising', label: 'Rising', icon: <TrendingUp size={10} /> },
                    { value: 'falling', label: 'Falling', icon: <TrendingDown size={10} /> },
                  ]}
                />
                {isDraft && (
                  <TogglePill
                    value={cardMetric}
                    onChange={(v) => setCardMetric(v as 'wr' | 'alsa')}
                    options={[
                      { value: 'wr', label: 'Win Rate' },
                      { value: 'alsa', label: 'ALSA' },
                    ]}
                  />
                )}
              </div>
              {isRefetching ? (
                <SectionShimmer />
              ) : cards.length > 0 ? (
                <InfiniteCarousel speed={40}>
                  {cards.map((c, i) => (
                    <CardItem key={c.name} item={c} index={i} direction={cardDirection} metric={cardMetric} />
                  ))}
                </InfiniteCarousel>
              ) : (
                <EmptyState label="card" />
              )}
            </PulseSection>

            {/* ── Trophy Decks Pulse ───────────────────────────────── */}
            <PulseSection
              icon={<Trophy size={16} className="text-amber-400" />}
              title="Trophy Decks Pulse"
              subtitle="Cards with biggest trophy share shift"
              delay={0.16}
            >
              <div className="flex items-center gap-2 mb-1">
                <TogglePill
                  value={trophyDirection}
                  onChange={(v) => setTrophyDirection(v as 'gaining' | 'losing')}
                  options={[
                    { value: 'gaining', label: 'Gaining', icon: <TrendingUp size={10} /> },
                    { value: 'losing', label: 'Losing', icon: <TrendingDown size={10} /> },
                  ]}
                />
              </div>
              {isRefetching ? (
                <SectionShimmer />
              ) : trophyMovers.length > 0 ? (
                <InfiniteCarousel speed={35}>
                  {trophyMovers.map((t, i) => (
                    <TrophyCard key={t.name} item={t} index={i} direction={trophyDirection} />
                  ))}
                </InfiniteCarousel>
              ) : (
                <EmptyState label="trophy" />
              )}
            </PulseSection>
          </>
        )}
      </div>
    </div>
  )
}
