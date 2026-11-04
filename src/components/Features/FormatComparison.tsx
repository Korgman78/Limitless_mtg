import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { FormatComparisonProps } from '../../types';
import { PLAYER_LEVEL_OPTIONS } from '../../constants';
import { useDebounce } from '../../hooks/useDebounce';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useFormatComparison } from '../../queries/useFormatComparison';
import { usePlayerLevelComparison } from '../../queries/usePlayerLevelComparison';
import { useCompareSamples } from '../../queries/useCompareSamples';
import type { Axis, CompareFilters, CompareRow, CompareSettings, Metric, SortKey, Subject } from './Compare/compareModel';
import { axisDomain, buildRows, filterRows, formatLabel, levelLabel, sortRows } from './Compare/compareModel';
import { CompareHeader } from './Compare/CompareHeader';
import { CompareFiltersBar, countActiveFilters } from './Compare/CompareFiltersBar';
import { CompareSummary } from './Compare/CompareSummary';
import { CompareTable } from './Compare/CompareTable';
import { CompareDetailSheet } from './Compare/CompareDetailSheet';

/** Reglages persistes : chaque axe garde sa propre paire A/B. */
interface StoredSettings {
  axis: Axis;
  subject: Subject;
  fmtA: string;
  fmtB: string;
  lvlA: string;
  lvlB: string;
  skillFormat: string;
  metric: Metric;
}

// Lecture gauche vs droite : Shift = A - B, positif = mieux a gauche.
const DEFAULTS: StoredSettings = {
  axis: 'format',
  subject: 'archetypes',
  fmtA: 'ArenaDirect_Sealed',
  fmtB: 'PremierDraft',
  lvlA: 'top',
  lvlB: 'global',
  skillFormat: 'PremierDraft',
  metric: 'wr',
};

const DEFAULT_FILTERS: CompareFilters = { search: '', colors: [], rarities: [], archType: 'all', hideSmallSamples: true };

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export const FormatComparison: React.FC<FormatComparisonProps> = ({ activeSet, onCardClick, onArchetypeClick }) => {
  const [stored, setStored] = useLocalStorage<StoredSettings>('limitless-compare-v2', DEFAULTS);
  const st: StoredSettings = { ...DEFAULTS, ...stored };
  const isSkill = st.axis === 'skill';

  const settings: CompareSettings = {
    axis: st.axis,
    subject: isSkill ? 'cards' : st.subject,
    a: isSkill ? st.lvlA : st.fmtA,
    b: isSkill ? st.lvlB : st.fmtB,
    skillFormat: st.skillFormat,
    metric: st.metric,
  };

  const [filters, setFilters] = useState<CompareFilters>(DEFAULT_FILTERS);
  const debouncedSearch = useDebounce<string>(filters.search, 250);
  const [sortKey, setSortKey] = useState<SortKey>('shift');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detail, setDetail] = useState<CompareRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const formatQuery = useFormatComparison(activeSet, st.subject, !isSkill);
  const playerQuery = usePlayerLevelComparison(activeSet, st.skillFormat, isSkill);
  const samplesQuery = useCompareSamples(activeSet, st.subject, st.fmtA, st.fmtB, !isSkill);
  const query = isSkill ? playerQuery : formatQuery;
  const data = query.data ?? [];

  const availableLevels = useMemo(() => {
    const out = new Set<string>();
    if (!isSkill) return out;
    for (const o of PLAYER_LEVEL_OPTIONS) {
      if ((playerQuery.data ?? []).some((r: any) => r[`card_wr_${o.value}`] != null)) out.add(o.value);
    }
    return out;
  }, [isSkill, playerQuery.data]);

  const patchSettings = useCallback((patch: Partial<CompareSettings>) => {
    setStored(prev => {
      const cur = { ...DEFAULTS, ...prev };
      const next = { ...cur };
      if (patch.axis) next.axis = patch.axis;
      if (patch.subject) next.subject = patch.subject;
      if (patch.skillFormat) next.skillFormat = patch.skillFormat;
      if (patch.metric) next.metric = patch.metric;
      const skill = next.axis === 'skill';
      const [ka, kb] = skill ? (['lvlA', 'lvlB'] as const) : (['fmtA', 'fmtB'] as const);
      // Choisir le meme cote des deux cotes n'a pas de sens : on echange.
      if (patch.a && patch.a !== cur[ka]) {
        if (patch.a === cur[kb]) next[kb] = cur[ka];
        next[ka] = patch.a;
      }
      if (patch.b && patch.b !== cur[kb]) {
        if (patch.b === cur[ka]) next[ka] = cur[kb];
        next[kb] = patch.b;
      }
      return next;
    });
  }, [setStored]);

  const swap = useCallback(() => {
    setStored(prev => {
      const cur = { ...DEFAULTS, ...prev };
      return cur.axis === 'skill'
        ? { ...cur, lvlA: cur.lvlB, lvlB: cur.lvlA }
        : { ...cur, fmtA: cur.fmtB, fmtB: cur.fmtA };
    });
  }, [setStored]);

  const patchFilters = useCallback((patch: Partial<CompareFilters>) => setFilters(f => ({ ...f, ...patch })), []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const allRows = useMemo(
    () => buildRows(data, settings, isSkill ? undefined : samplesQuery.data?.games),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, samplesQuery.data, settings.axis, settings.subject, settings.a, settings.b, settings.metric],
  );
  const { visible, hiddenSmall } = useMemo(
    () => filterRows(allRows, { ...filters, search: debouncedSearch, hideSmallSamples: !isSkill && filters.hideSmallSamples }),
    [allRows, filters, debouncedSearch, isSkill],
  );
  // Pas de taille d'echantillon par niveau de joueur : un tri par parties retombe sur le shift.
  const effectiveSort: SortKey = isSkill && sortKey === 'games' ? 'shift' : sortKey;
  const sorted = useMemo(() => sortRows(visible, effectiveSort, sortDir), [visible, effectiveSort, sortDir]);
  const domain = useMemo(
    () => axisDomain(visible, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, settings.axis, settings.subject, settings.metric],
  );

  const openRow = (r: CompareRow) => {
    setDetail(null);
    if (r.kind === 'card') onCardClick?.(r.id);
    else onArchetypeClick?.(r.id);
  };
  const selectRow = (r: CompareRow) => (isDesktop() ? openRow(r) : setDetail(r));

  const isCards = settings.subject === 'cards';
  const activeFilterCount = countActiveFilters(filters, isCards);
  const sideText = (v: string) => (isSkill ? `for ${levelLabel(v)} players` : `in ${formatLabel(v)}`);
  const skillUnavailable = isSkill && !playerQuery.isLoading && !(availableLevels.has(settings.a) && availableLevels.has(settings.b));

  const filtersBar = (stacked: boolean) => (
    <CompareFiltersBar
      filters={filters}
      onChange={patchFilters}
      isCards={isCards}
      showSampleToggle={!isSkill}
      hiddenSmall={hiddenSmall}
      stacked={stacked}
    />
  );

  let body: React.ReactNode;
  if (query.isLoading || (!isSkill && samplesQuery.isLoading)) {
    body = (
      <div className="space-y-2" aria-busy="true">
        {[...Array(8)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-900/60" />)}
      </div>
    );
  } else if (query.error) {
    body = (
      <EmptyState icon>Couldn't load the comparison. Check your connection and try again.</EmptyState>
    );
  } else if (skillUnavailable) {
    body = (
      <EmptyState>
        Skill-level win rates aren't available for {activeSet} in {formatLabel(settings.skillFormat)}
        {availableLevels.size > 1 ? ' for these levels. Pick another level above.' : ' yet.'}
      </EmptyState>
    );
  } else if (sorted.length === 0) {
    body = (
      <EmptyState>
        {allRows.length === 0
          ? `No data to compare for ${activeSet} yet.`
          : hiddenSmall > 0 && visible.length === 0 && activeFilterCount === 0
            ? 'Every row has too few games. Untick "Hide small samples" to see them anyway.'
            : 'Nothing matches these filters.'}
        {activeFilterCount > 0 && (
          <button onClick={() => setFilters({ ...DEFAULT_FILTERS, hideSmallSamples: filters.hideSmallSamples })} className="mt-3 block w-full text-xs font-bold text-indigo-300 hover:text-white">
            Clear filters
          </button>
        )}
      </EmptyState>
    );
  } else {
    body = (
      <>
        {!filters.search && <CompareSummary rows={sorted} sideA={sideText(settings.a)} sideB={sideText(settings.b)} onSelect={selectRow} />}
        <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
          <span>{sorted.length} {isCards ? 'cards' : 'archetypes'}</span>
          <label className="flex items-center gap-1.5 md:hidden">
            Sort
            <select
              value={`${effectiveSort}:${sortDir}`}
              onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k as SortKey); setSortDir(d as 'asc' | 'desc'); }}
              className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] font-bold text-slate-200 outline-none"
            >
              <option value="shift:desc">Better {sideText(settings.a)}</option>
              <option value="shift:asc">Better {sideText(settings.b)}</option>
              <option value="a:desc">Best {isSkill ? `${levelLabel(settings.a)} players` : formatLabel(settings.a)}</option>
              {!isSkill && <option value="games:desc">Most played</option>}
              <option value="name:asc">Name</option>
            </select>
          </label>
        </div>
        <CompareTable
          rows={sorted}
          settings={settings}
          domain={domain}
          sortKey={effectiveSort}
          sortDir={sortDir}
          onSort={handleSort}
          onSelect={selectRow}
          showGames={!isSkill}
        />
      </>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col gap-3 pb-32 md:gap-4">
      <CompareHeader
        settings={settings}
        onChange={patchSettings}
        onSwap={swap}
        availableLevels={availableLevels}
        baselines={samplesQuery.data?.baselines ?? {}}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setFiltersOpen(true)}
        filters={filtersBar(false)}
      />

      {body}

      <AnimatePresence>
        {detail && (
          <CompareDetailSheet key="detail" row={detail} settings={settings} domain={domain} onClose={() => setDetail(null)} onOpen={openRow} />
        )}
        {filtersOpen && (
          <motion.div
            key="filters"
            className="fixed inset-0 z-[950] flex items-end bg-black/60 backdrop-blur-sm md:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setFiltersOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-label="Filters"
              className="w-full rounded-t-2xl border-t border-slate-700 bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
              <h3 className="mb-3 text-sm font-black text-white">Filters</h3>
              {filtersBar(true)}
              <button onClick={() => setFiltersOpen(false)} className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white">
                Show {sorted.length} {isCards ? 'cards' : 'archetypes'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const EmptyState: React.FC<{ children: React.ReactNode; icon?: boolean }> = ({ children, icon }) => (
  <div className="rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center text-sm text-slate-400">
    {icon && <AlertTriangle size={18} className="mx-auto mb-2 text-amber-400" />}
    {children}
  </div>
);
