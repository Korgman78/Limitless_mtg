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
  const sections = useMemo(() => {
    const s: React.ReactNode[] = [];

    // Header always present
    s.push(<MetaPulseHeader key="header" data={data} />);

    // Cards Spotlight
    if (data.cards_spotlight) {
      s.push(
        <CardsSpotlight
          key="spotlight"
          rising={data.cards_spotlight.rising || []}
          falling={data.cards_spotlight.falling || []}
        />
      );
    }

    // Moving Archetypes
    if (data.moving_archetypes) {
      s.push(
        <MovingArchetypes
          key="archetypes"
          rising={data.moving_archetypes.rising || []}
          falling={data.moving_archetypes.falling || []}
        />
      );
    }

    // Trophy Movers
    if (data.trophy_movers) {
      s.push(
        <TrophyMovers
          key="trophies"
          gaining={data.trophy_movers.gaining || []}
          losing={data.trophy_movers.losing || []}
        />
      );
    }

    // Synergies
    if (data.synergies && data.synergies.length > 0) {
      s.push(<SynergySpotlight key="synergies" synergies={data.synergies} />);
    }

    return s;
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-y-auto">
      {/* Title bar */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 px-6 py-5 border-b border-indigo-500/20">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          <div>
            <h2 className="text-xl font-bold text-white">{article.title}</h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {data.set_name} — {data.format_label}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="px-6 py-6 space-y-8">
        {sections.map((section, i) => (
          <motion.div
            key={i}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
          >
            {section}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
