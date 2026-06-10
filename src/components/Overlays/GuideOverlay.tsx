import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, BookOpen, Layers, Zap, Repeat, Trophy, Newspaper, Sigma,
  Eye, MousePointerClick, Sparkles, ArrowRight,
} from 'lucide-react';
import { haptics } from '../../utils/haptics';

/* ------------------------------------------------------------------ *
 *  Guide content — kept in English to match the app's UI language.
 *  Each "see" / "do" bullet is { b: bold lead, t: rest } so it renders
 *  with the same didactic emphasis used elsewhere in the app.
 * ------------------------------------------------------------------ */

type Bullet = { b: string; t: string };

interface GuideSection {
  id: string;            // matches App.tsx activeTab when navigable
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  accent: string;        // tailwind text color for the section title/icon
  marker: string;        // tailwind bg color for the "do" bullet markers (literal — Tailwind-safe)
  glow: string;          // tailwind gradient stop for the ambient header glow
  tagline: string;
  see: Bullet[];
  doItems: Bullet[];
  proTip: string;
  cta?: { tab: string; label: string };
  badge?: string;
}

const SECTIONS: GuideSection[] = [
  {
    id: 'decks',
    label: 'Metagame Breakdown',
    Icon: Layers,
    accent: 'text-indigo-400',
    marker: 'bg-indigo-400',
    glow: 'from-indigo-500/20',
    tagline: 'Your home base — see which archetypes are winning and how the whole format is shaped, at a glance.',
    see: [
      { b: 'Metagame charts', t: ' — the share of games played by each archetype, plus a colour-pair breakdown.' },
      { b: 'Archetypes Breakdown', t: ' — every 2 & 3-colour pair with its win rate, meta share % and a sparkline of its recent trend. Win rates are tinted green/red vs the format average.' },
      { b: 'Format Blueprint', t: ' — the format’s DNA: the Prince-O-Meter (how much bombs/rares decide games), best & worst cards by rarity and by colour, and Archetype & Colour Balance scores out of 10.' },
    ],
    doItems: [
      { b: 'Switch deck type', t: ' between Two colours, + splash, Three colours or more.' },
      { b: 'Open Archetype Analysis', t: ' — click any archetype for its dashboard: win rate, meta share and 14-day trend, plus its best Commons & Uncommons, Hidden Gems (strong cards that go surprisingly late) and Traps (popular cards that underperform in this pairing).' },
      { b: 'Open Metagame Pulse', t: ' (the Live button) to see what’s rising or falling over the last 3 days → since release.' },
      { b: 'Dig into the Blueprint', t: ' — toggle By Rarity / By Colour, expand a row for top/bottom cards, or compare balance across sets.' },
    ],
    proTip: 'The little sparkline next to each archetype is its win-rate trend — a line tilting up means the deck is gaining steam this week.',
    cta: { tab: 'decks', label: 'Open Metagame Breakdown' },
  },
  {
    id: 'cards',
    label: 'Cards Ratings',
    Icon: Zap,
    accent: 'text-cyan-400',
    marker: 'bg-cyan-400',
    glow: 'from-cyan-500/20',
    tagline: 'Every card in the set, ranked by real performance, with filters to slice it any way you want.',
    see: [
      { b: 'GIH WR', t: ' — the Games-In-Hand win rate of each card, tinted vs the format average (the headline quality metric).' },
      { b: 'ALSA', t: ' — how late on average the card is still seen in packs (a proxy for how contested it is).' },
      { b: 'Trend indicator', t: ' — a small marker in the corner showing whether the card’s win rate is climbing or sliding.' },
    ],
    doItems: [
      { b: 'Filter by archetype', t: ' (Global or any guild/trio) to read a card’s win rate inside that colour pair.' },
      { b: 'Filter & sort', t: ' by colour, rarity, and by GIH / ALSA / TREND.' },
      { b: 'Search a card', t: ' by name with full-text autocomplete.' },
      { b: 'Open Card Analysis', t: ' — click any card for its detail popup: an evaluation matrix plotting its win rate against pick order, how it performs across the archetypes that play it, and the cards it’s most often played alongside and synergises with.' },
      { b: 'Open Card Graphs', t: ' — three views in one: the WR / ALSA scatter (undervalued cards jump out), a Map where cards cluster by how often they share trophy decks, and Communities that auto-group cards into synergy packages.' },
      { b: 'Toggle PIVOT', t: ' — filter to the format’s pivot cards: commons & uncommons with above-average win rate that perform the most consistently across every archetype (the safe, flexible picks).' },
    ],
    proTip: 'Sort by ALSA, then look for high win-rate cards that are picked late — those are your sleeper value picks.',
    cta: { tab: 'cards', label: 'Open Cards Ratings' },
  },
  {
    id: 'compare',
    label: 'Compare',
    Icon: Repeat,
    accent: 'text-purple-400',
    marker: 'bg-purple-400',
    glow: 'from-purple-500/20',
    tagline: 'See how cards and archetypes shift between two formats — or between player skill levels.',
    see: [
      { b: 'Archetypes', t: ' — each archetype’s win rate (or meta share) in Format A vs Format B, with the Shift between them.' },
      { b: 'Cards · Formats', t: ' — each card’s performance in two formats, surfacing over- and under-performers.' },
      { b: 'Cards · Players', t: ' — a card’s raw win rate for Top vs Bottom players; a positive shift means the card rewards skill.' },
    ],
    doItems: [
      { b: 'Pick the two sides', t: ' — any two formats, or any two player levels (Global / Top / Middle / Bottom).' },
      { b: 'Toggle WR vs META', t: ' share in the archetypes view.' },
      { b: 'Flip the sort', t: ' between Overperformers and Underperformers, and filter by colour/rarity.' },
    ],
    proTip: '"Cards · Players" reveals skill-testers: cards that win far more in expert hands are worth mastering — or hate-drafting away from opponents.',
    cta: { tab: 'compare', label: 'Open Compare' },
  },
  {
    id: 'trophies',
    label: 'Trophy Decks',
    Icon: Trophy,
    accent: 'text-amber-400',
    marker: 'bg-amber-400',
    glow: 'from-amber-500/20',
    tagline: 'Statistical "skeletons" built from real 7-win trophy decks — a data-driven blueprint for each archetype.',
    see: [
      { b: 'Archetype skeletons', t: ' — each built from 20+ trophy decks: average spell curve, creature/spell ratio, land count and colour pip distribution.' },
      { b: 'The full deck', t: ' laid out by mana value, with the Core Cards (the defining pillars) highlighted.' },
      { b: 'Archetype Insights', t: ' — a flexibility score, Sleeper / Trending / Declining cards, and a card importance ranking (frequency + synergy + win rate).' },
    ],
    doItems: [
      { b: 'Toggle the view', t: ' between Full Deck / Core Cards Only and Main / Alternative variants.' },
      { b: 'Open the Trophies Map', t: ' — a cluster map where each dot is a real trophy deck and distance = card similarity; highlight an archetype’s signature cards or search a card to light up every deck playing it.' },
      { b: 'Test your own deck', t: ' to find the closest matching archetype, and tap the ❓ for the full methodology.' },
    ],
    proTip: '"Core Cards Only" strips the deck down to its non-negotiable picks — prioritise these when you draft the archetype.',
    cta: { tab: 'trophies', label: 'Open Trophy Decks' },
  },
  {
    id: 'press',
    label: 'Press Review',
    Icon: Newspaper,
    accent: 'text-sky-400',
    marker: 'bg-sky-400',
    glow: 'from-sky-500/20',
    tagline: 'The set’s content hub — curated articles & videos, summarised and aware of the cards they mention.',
    see: [
      { b: 'Curated feed', t: ' of recent articles and videos, each with a community sentiment badge (Great Read / Mixed / Controversial).' },
      { b: 'Interactive card names', t: ' — hover any referenced card to preview its art inline.' },
      { b: 'A Meta Pulse article', t: ' generated automatically from the data.' },
    ],
    doItems: [
      { b: 'Open an article', t: ' in a clean reading view, and vote sentiment on it.' },
      { b: 'Jump to the stats', t: ' — click a card mentioned in an article to land straight on its numbers in the format you choose.' },
    ],
    proTip: 'Card mentions are clickable — go from "this card is busted" in an article to its actual win rate in a single tap.',
    cta: { tab: 'press', label: 'Open Press Review' },
  },
];

/* Metrics glossary — the jargon the app uses everywhere. */
const GLOSSARY: { term: string; def: string }[] = [
  { term: 'GIH WR', def: 'Games In Hand win rate — the win % of games where you had the card in hand (drawn or in your opening hand). The main card-quality metric.' },
  { term: 'ALSA', def: 'Average Last Seen At — the average pick number where a card was last seen in packs. Lower = taken earlier = more contested.' },
  { term: 'Delta', def: 'A value’s gap versus the format’s average win rate (e.g. +2.4 means 2.4 points above average).' },
  { term: 'Shift', def: 'In Compare, the difference of a metric between the two things you’re comparing (Format A vs B, or Top vs Bottom players).' },
  { term: 'Meta share', def: 'The percentage of all games played by a given archetype.' },
  { term: 'Trophy deck', def: 'A 7-win (7-X) run on Arena. These decks are the dataset behind Trophy Decks and the Trophies Map.' },
  { term: 'Core card', def: 'One of the highest-frequency pillars that defines an archetype’s skeleton — the cards you almost always run.' },
];

const GLOSSARY_ID = '__glossary';

interface GuideOverlayProps {
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

const SubHead: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-slate-400">{icon}</span>
    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{children}</h4>
  </div>
);

const BulletList: React.FC<{ items: Bullet[]; marker: string }> = ({ items, marker }) => (
  <ul className="space-y-2">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-400">
        <span className={`mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full ${marker}`} />
        <span>
          <strong className="font-semibold text-slate-200">{it.b}</strong>{it.t}
        </span>
      </li>
    ))}
  </ul>
);

export const GuideOverlay: React.FC<GuideOverlayProps> = ({ onClose, onNavigate }) => {
  const [active, setActive] = useState<string>('decks');

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const section = SECTIONS.find(s => s.id === active);
  const showGlossary = active === GLOSSARY_ID;

  const handleSelect = (id: string) => { haptics.light(); setActive(id); };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[950] hidden md:flex items-center justify-center bg-black/70 backdrop-blur-md p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-b from-slate-900/98 to-slate-950/99 shadow-2xl"
      >
        {/* ───────────── Left rail (mirrors the app sidebar) ───────────── */}
        <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/25">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black leading-none tracking-tight text-white">Guide</h2>
              <p className="text-[10px] font-medium text-slate-500">How Limitless works</p>
            </div>
          </div>

          <nav className="space-y-1">
            {SECTIONS.map(({ id, label, Icon, badge }) => {
              const isActive = id === active;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                    isActive
                      ? 'border border-indigo-500/50 bg-indigo-500/10 font-bold text-indigo-300'
                      : 'border border-transparent text-slate-400 hover:bg-slate-800/70'
                  }`}
                >
                  <Icon size={18} strokeWidth={2.5} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {badge && (
                    <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-slate-800 pt-3">
            <button
              onClick={() => handleSelect(GLOSSARY_ID)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                showGlossary
                  ? 'border border-indigo-500/50 bg-indigo-500/10 font-bold text-indigo-300'
                  : 'border border-transparent text-slate-400 hover:bg-slate-800/70'
              }`}
            >
              <Sigma size={18} strokeWidth={2.5} className="flex-shrink-0" />
              <span className="flex-1">Metrics glossary</span>
            </button>
          </div>
        </aside>

        {/* ───────────── Right content pane ───────────── */}
        <div className="relative flex-1 overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/40 p-2 text-slate-300 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
            aria-label="Close guide"
          >
            <X size={18} />
          </button>

          <AnimatePresence mode="wait">
            {showGlossary ? (
              <motion.div
                key="glossary"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="p-8 pr-14"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-500/10 to-transparent" />
                <div className="relative">
                  <div className="mb-1 flex items-center gap-2.5">
                    <Sigma className="text-slate-300" size={22} />
                    <h3 className="text-2xl font-black tracking-tight text-white">Metrics glossary</h3>
                  </div>
                  <p className="mb-7 text-sm text-slate-400">The handful of terms that show up across every tab.</p>

                  <div className="space-y-2.5">
                    {GLOSSARY.map(({ term, def }) => (
                      <div key={term} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <div className="mb-1 text-sm font-black uppercase tracking-wide text-indigo-300">{term}</div>
                        <p className="text-[13px] leading-relaxed text-slate-400">{def}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : section ? (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="p-8 pr-14"
              >
                {/* Ambient header glow */}
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b ${section.glow} to-transparent`} />

                <div className="relative">
                  {/* Title */}
                  <div className="mb-1 flex items-center gap-3">
                    <section.Icon className={section.accent} size={26} strokeWidth={2.5} />
                    <h3 className="text-2xl font-black tracking-tight text-white">{section.label}</h3>
                    {section.badge && (
                      <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                        {section.badge}
                      </span>
                    )}
                  </div>
                  <p className="mb-7 max-w-2xl text-sm leading-relaxed text-slate-300">{section.tagline}</p>

                  {/* What you see */}
                  <section className="mb-7">
                    <SubHead icon={<Eye size={14} />}>What you see</SubHead>
                    <BulletList items={section.see} marker="bg-slate-500" />
                  </section>

                  {/* What you can do */}
                  <section className="mb-7">
                    <SubHead icon={<MousePointerClick size={14} />}>What you can do</SubHead>
                    <BulletList items={section.doItems} marker={section.marker} />
                  </section>

                  {/* Pro tip */}
                  <div className="mb-7 flex gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.07] p-4">
                    <Sparkles size={16} className="mt-0.5 flex-shrink-0 text-indigo-300" />
                    <p className="text-[13px] leading-relaxed text-slate-300">
                      <strong className="font-bold text-indigo-300">Pro tip — </strong>{section.proTip}
                    </p>
                  </div>

                  {/* CTA: jump into the real tab */}
                  {section.cta && (
                    <button
                      onClick={() => { haptics.light(); onNavigate(section.cta!.tab); onClose(); }}
                      className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-500 hover:to-indigo-400 hover:shadow-indigo-500/40"
                    >
                      <span>{section.cta.label}</span>
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
