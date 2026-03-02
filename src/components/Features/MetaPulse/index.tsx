import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import type { Article } from '../../../types';
import type { MetaPulseData } from './types';
import { MetaPulseHeader } from './MetaPulseHeader';
import { CardsSpotlight } from './CardsSpotlight';
import { MovingArchetypes } from './MovingArchetypes';
import { TrophyMovers } from './TrophyMovers';
import { SynergySpotlight } from './SynergySpotlight';

interface Props {
  data: MetaPulseData;
  article: Article;
}

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3 },
  }),
};

export const MetaPulseArticle: React.FC<Props> = ({ data, article }) => {
  const periodDays = useMemo(() => {
    const from = new Date(data.period.from);
    const to = new Date(data.period.to);
    const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    return Number.isFinite(diff) && diff > 0 ? diff : null;
  }, [data.period.from, data.period.to]);

  const sections = useMemo(() => {
    const s: { key: string; node: React.ReactNode }[] = [];

    s.push({ key: 'header', node: <MetaPulseHeader data={data} /> });

    if (data.cards_spotlight) {
      s.push({
        key: 'spotlight',
        node: (
          <CardsSpotlight
            rising={data.cards_spotlight.rising || []}
            falling={data.cards_spotlight.falling || []}
          />
        ),
      });
    }

    if (data.moving_archetypes) {
      s.push({
        key: 'archetypes',
        node: (
          <MovingArchetypes
            rising={data.moving_archetypes.rising || []}
            falling={data.moving_archetypes.falling || []}
          />
        ),
      });
    }

    if (data.trophy_movers) {
      s.push({
        key: 'trophies',
        node: (
          <TrophyMovers
            gaining={data.trophy_movers.gaining || []}
            losing={data.trophy_movers.losing || []}
          />
        ),
      });
    }

    if (data.synergies && data.synergies.length > 0) {
      s.push({ key: 'synergies', node: <SynergySpotlight synergies={data.synergies} /> });
    }

    return s;
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-950/90 via-slate-900/90 to-purple-950/90 backdrop-blur-md px-6 py-5 border-b border-indigo-500/20">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <BarChart3 className="w-6 h-6 text-indigo-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white">{article.title}</h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {data.set_name} - {data.format_label}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 uppercase tracking-wide">
                Meta evolution
              </span>
              <span className="text-[10px] px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-300 uppercase tracking-wide">
                {periodDays ? `${periodDays}d window` : 'Rolling window'}
              </span>
              <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 uppercase tracking-wide">
                Delta vs previous period
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 space-y-8 max-w-3xl mx-auto w-full">
        {sections.map((section, i) => (
          <motion.div
            key={section.key}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
          >
            {section.node}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
