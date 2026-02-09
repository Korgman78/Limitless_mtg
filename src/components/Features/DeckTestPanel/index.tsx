import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sparkles, Target } from 'lucide-react';
import { haptics } from '../../../utils/haptics';
import { useDeckAnalysis } from '../../../hooks/useDeckAnalysis';
import { DeckImportModal } from './DeckImportModal';
import { DeckAnalysisModal } from './DeckAnalysisModal';
import { CardZoomOverlay } from './CardZoomOverlay';

interface DeckTestPanelProps {
  activeSet: string;
  activeFormat: string;
  onFormatChange?: (format: string) => void;
  onMatchedArchetype: (
    archetypeName: string,
    format: string,
    isAlternative: boolean,
  ) => void;
  className?: string;
}

export const DeckTestPanel: React.FC<DeckTestPanelProps> = ({
  activeSet,
  activeFormat,
  onFormatChange,
  onMatchedArchetype,
  className,
}) => {
  const analysis = useDeckAnalysis({
    activeSet,
    activeFormat,
    onFormatChange,
    onMatchedArchetype,
  });

  return (
    <>
      {/* Trigger buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            haptics.light();
            analysis.openImportModal();
          }}
          className={
            className
              ? `${className} h-10`
              : 'h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 text-indigo-200 text-[10px] font-bold uppercase tracking-widest transition-all'
          }
        >
          <Sparkles size={13} className="text-indigo-300" />
          Test My Deck
        </button>

        {analysis.deckAnalysis && (
          <button
            onClick={() => {
              haptics.light();
              analysis.openLastDeck();
            }}
            className="h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-cyan-500/12 border border-cyan-400/30 hover:bg-cyan-500/22 text-cyan-200 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <Target size={13} className="text-cyan-300" />
            See My Deck
          </button>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {analysis.showImportModal && (
          <DeckImportModal
            analysisFormat={analysis.analysisFormat}
            deckImportText={analysis.deckImportText}
            importError={analysis.importError}
            isAnalyzingDeck={analysis.isAnalyzingDeck}
            onFormatChange={analysis.setAnalysisFormat}
            onTextChange={analysis.setDeckImportText}
            onAnalyze={analysis.runDeckAnalysis}
            onClose={() => analysis.setShowImportModal(false)}
          />
        )}

        {analysis.showAnalysisModal && (
          <DeckAnalysisModal
            deckAnalysis={analysis.deckAnalysis}
            isLoading={analysis.isAnalyzingDeck}
            creatureDelta={analysis.creatureDelta}
            creatureTone={analysis.creatureTone}
            creatureStatus={analysis.creatureStatus}
            effectiveCoreCards={analysis.effectiveCoreCards}
            corePresent={analysis.corePresent}
            coreMissing={analysis.coreMissing}
            criticalCurveInsights={analysis.criticalCurveInsights}
            minorCurveInsights={analysis.minorCurveInsights}
            curveMaxReference={analysis.curveMaxReference}
            onClose={() => analysis.setShowAnalysisModal(false)}
            onNewAnalysis={() => {
              analysis.setShowAnalysisModal(false);
              analysis.openImportModal();
            }}
            onOpenArchetype={() => {
              analysis.openMatchedArchetype();
              haptics.success();
            }}
            onZoomCard={analysis.setZoomedCardName}
          />
        )}
      </AnimatePresence>

      {/* Card zoom */}
      <CardZoomOverlay
        cardName={analysis.zoomedCardName}
        onClose={() => analysis.setZoomedCardName(null)}
      />
    </>
  );
};
