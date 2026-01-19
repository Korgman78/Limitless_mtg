import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`relative overflow-hidden bg-slate-800/50 rounded ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-slate-700/30 to-transparent" />
  </div>
);

// Skeleton pour les cartes du Card Ratings
export const CardSkeleton: React.FC = () => (
  <div className="w-full flex md:flex-row items-center gap-3 bg-slate-900/40 p-2 md:p-3 rounded-lg border border-slate-800/50 md:shadow-md">
    <Skeleton className="w-11 h-16 md:w-16 md:h-24 rounded-[4px] md:rounded-md flex-shrink-0" />
    <div className="flex-1 min-w-0 flex flex-col justify-center h-full gap-2">
      <Skeleton className="h-4 w-3/4 rounded" />
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-6 rounded" />
            <Skeleton className="h-4 w-8 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-6 w-14 rounded" />
      </div>
    </div>
  </div>
);

// Skeleton pour les archétypes
export const DeckSkeleton: React.FC = () => (
  <div className="w-full flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-sm md:shadow-md">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-6 rounded" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
    <div className="flex flex-col items-end gap-1">
      <Skeleton className="h-7 w-16 rounded" />
      <Skeleton className="h-3 w-12 rounded" />
    </div>
  </div>
);

// Skeleton pour Format Comparison rows
export const ComparisonRowSkeleton: React.FC = () => (
  <div className="w-full bg-slate-900/50 border border-slate-800/60 rounded-xl p-3.5 flex items-center justify-between">
    <div className="flex items-center gap-4 min-w-0 flex-1">
      <Skeleton className="w-12 h-16 md:w-14 md:h-20 rounded-lg flex-shrink-0" />
      <Skeleton className="h-4 w-32 rounded" />
    </div>
    <div className="flex flex-row items-center gap-2 md:gap-3 flex-shrink-0">
      <div className="flex flex-col items-end gap-1">
        <Skeleton className="h-2 w-12 rounded" />
        <Skeleton className="h-4 w-10 rounded" />
      </div>
      <div className="flex flex-col items-end gap-1">
        <Skeleton className="h-2 w-12 rounded" />
        <Skeleton className="h-4 w-10 rounded" />
      </div>
      <Skeleton className="h-14 w-20 rounded-xl" />
    </div>
  </div>
);

// Skeleton pour les articles Press Review
export const ArticleSkeleton: React.FC = () => (
  <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
    <div className="md:flex">
      <Skeleton className="h-40 md:h-auto md:w-56 flex-shrink-0" />
      <div className="p-4 flex-1 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <Skeleton className="h-5 w-3/4 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
        <Skeleton className="h-3 w-20 rounded mt-2" />
      </div>
    </div>
  </div>
);

// Skeleton pour CardDetailOverlay
export const CardDetailSkeleton: React.FC = () => (
  <div className="p-6 pt-16 space-y-6 overflow-y-auto h-full">
    {/* Header with card image */}
    <div className="flex flex-col sm:flex-row items-start gap-4">
      <Skeleton className="w-32 h-44 md:w-40 md:h-56 rounded-lg flex-shrink-0 mx-auto sm:mx-0" />
      <div className="flex-1 w-full space-y-3">
        <Skeleton className="h-7 w-3/4 rounded" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-14 col-span-2 rounded-lg" />
        </div>
      </div>
    </div>

    {/* Matrix */}
    <div className="space-y-2">
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-32 md:h-44 rounded-xl" />
      <Skeleton className="h-4 w-24 rounded mx-auto" />
    </div>

    {/* Cross Performance */}
    <div className="space-y-3">
      <Skeleton className="h-5 w-40 rounded" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  </div>
);

// Skeleton pour ArchetypeDashboard
export const ArchetypeDashboardSkeleton: React.FC = () => (
  <div className="flex flex-col h-full md:flex-row pt-12">
    {/* Left Panel - Archetype Info */}
    <div className="w-full md:w-80 lg:w-96 p-6 space-y-4 border-b md:border-b-0 md:border-r border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-3">
        <Skeleton className="w-14 h-14 rounded-xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>

      {/* Trend */}
      <Skeleton className="h-28 rounded-xl" />

      {/* Hidden Gems / Traps */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24 rounded" />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="w-10 h-14 rounded" />
          ))}
        </div>
      </div>
    </div>

    {/* Right Panel - Card List */}
    <div className="flex-1 p-6 space-y-4 overflow-y-auto">
      {/* Tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Card rows */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  </div>
);
