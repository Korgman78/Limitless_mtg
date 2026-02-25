import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import type { Article } from '../../../types';
import type { MetaPulseData } from './types';
import { MetaPulseHeader } from './MetaPulseHeader';
import { CardOfTheWeek } from './CardOfTheWeek';
import { ArchetypeRanking } from './ArchetypeRanking';
import { CardHighlights } from './CardHighlights';
import { TrophyTrends } from './TrophyTrends';
import { SynergySpotlight } from './SynergySpotlight';
import { CommunityBuzz } from './CommunityBuzz';

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

    // Card of the Week
    if (data.card_of_the_week) {
      s.push(<CardOfTheWeek key="cotw" card={data.card_of_the_week} />);
    }

    // Archetype Ranking
    if (data.archetypes?.top?.length > 0) {
      s.push(
        <ArchetypeRanking
          key="archetypes"
          top={data.archetypes.top}
          rising={data.archetypes.rising || []}
          falling={data.archetypes.falling || []}
        />
      );
    }

    // Card Highlights
    if (data.cards && (data.cards.stars?.length > 0 || data.cards.falling?.length > 0 || data.cards.sleepers?.length > 0)) {
      s.push(
        <CardHighlights
          key="cards"
          stars={data.cards.stars || []}
          falling={data.cards.falling || []}
          sleepers={data.cards.sleepers || []}
        />
      );
    }

    // Trophy Trends
    if (data.trophy_trends) {
      s.push(<TrophyTrends key="trophies" data={data.trophy_trends} />);
    }

    // Synergies
    if (data.synergies && data.synergies.length > 0) {
      s.push(<SynergySpotlight key="synergies" synergies={data.synergies} />);
    }

    // Community Buzz
    if (data.community_buzz && data.community_buzz.length > 0) {
      s.push(<CommunityBuzz key="buzz" items={data.community_buzz} />);
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
