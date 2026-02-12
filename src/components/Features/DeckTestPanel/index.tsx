import React, { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FlaskConical, Sparkles, Target } from 'lucide-react';
import { haptics } from '../../../utils/haptics';
import { SEALED_FORMAT_OPTIONS } from '../../../constants';
import { useDeckAnalysis } from '../../../hooks/useDeckAnalysis';
import { usePoolAnalysis } from '../../../hooks/usePoolAnalysis';
import { DeckImportModal } from './DeckImportModal';
import { DeckAnalysisModal } from './DeckAnalysisModal';
import { PoolAnalysisModal } from './PoolAnalysisModal';
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
  const pool = usePoolAnalysis({
    activeSet,
    activeFormat,
    onFormatChange,
  });

  const zoomedCardName = analysis.zoomedCardName || pool.zoomedCardName;

  // ── Centralized Escape key handler ──────────────────────────────────────
  // Priority: zoom overlay > analysis/pool modal > import modal
  const stateRef = useRef({ analysis, pool, zoomedCardName });
  stateRef.current = { analysis, pool, zoomedCardName };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { analysis: a, pool: p, zoomedCardName: z } = stateRef.current;
      if (z) {
        a.setZoomedCardName(null);
        p.setZoomedCardName(null);
        return;
      }
      if (p.showAnalysisModal) { p.setShowAnalysisModal(false); return; }
      if (a.showAnalysisModal) { a.setShowAnalysisModal(false); return; }
      if (p.showImportModal) { p.setShowImportModal(false); return; }
      if (a.showImportModal) { a.setShowImportModal(false); return; }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

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

        {pool.canUsePool && (
          <button
            onClick={() => {
              haptics.light();
              pool.openImportModal();
            }}
            className="h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-fuchsia-500/12 border border-fuchsia-400/30 hover:bg-fuchsia-500/22 text-fuchsia-200 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <FlaskConical size={13} className="text-fuchsia-300" />
            Test My Pool
          </button>
        )}

        {pool.canUsePool && pool.poolAnalysis && (
          <button
            onClick={() => {
              haptics.light();
              pool.openLastPool();
            }}
            className="h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-teal-500/12 border border-teal-400/30 hover:bg-teal-500/22 text-teal-200 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <Target size={13} className="text-teal-300" />
            See My Pool
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

        {pool.showImportModal && (
          <DeckImportModal
            analysisFormat={pool.analysisFormat}
            deckImportText={pool.poolImportText}
            importError={pool.importError}
            isAnalyzingDeck={pool.isAnalyzingPool}
            onFormatChange={pool.setAnalysisFormat}
            onTextChange={pool.setPoolImportText}
            onAnalyze={pool.runPoolAnalysis}
            onClose={() => pool.setShowImportModal(false)}
            title="Test My Pool"
            subtitle="Paste your MTGA sealed pool and generate the top 3 optimized builds."
            checklistItems={[
              '1. Keep the `Deck` header.',
              '2. Paste your full sealed pool (no cuts).',
              '3. Confirm format before analysis.',
              '4. Compare Best Build + alternatives.',
            ]}
            inputLabel="MTGA Pool Import"
            placeholder="Deck\n1 Card Name (SET) 123\n...\n\nSideboard\n..."
            analyzeLabel="Analyze Pool"
            formatOptions={SEALED_FORMAT_OPTIONS}
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

        {pool.showAnalysisModal && (
          <PoolAnalysisModal
            poolAnalysis={pool.poolAnalysis}
            isLoading={pool.isAnalyzingPool}
            loadingProgress={pool.poolOptimizationProgress}
            selectedBuildIndex={pool.selectedBuildIndex}
            selectedTab={pool.selectedTab}
            userDeckBuild={pool.poolAnalysis?.userDeckBuild || null}
            onSelectBuild={pool.changeBuild}
            onSelectUserDeck={pool.selectUserDeckTab}
            onTestCustomDeck={pool.openCustomDeckModal}
            onClose={() => pool.setShowAnalysisModal(false)}
            onNewPool={() => {
              pool.setShowAnalysisModal(false);
              pool.openImportModal();
            }}
            onOpenArchetype={() => {
              pool.openBuildArchetype(onMatchedArchetype);
              haptics.success();
            }}
            onZoomCard={pool.setZoomedCardName}
          />
        )}

        {pool.showCustomDeckModal && (
          <DeckImportModal
            analysisFormat={pool.analysisFormat}
            deckImportText={pool.customDeckText}
            importError={pool.customDeckError}
            isAnalyzingDeck={pool.isAnalyzingCustomDeck}
            onFormatChange={() => {
              // Custom deck score uses current pool format; format switch disabled by design.
            }}
            onTextChange={pool.setCustomDeckText}
            onAnalyze={pool.runCustomDeckScore}
            onClose={() => pool.setShowCustomDeckModal(false)}
            title="Test Custom Deck"
            subtitle="Paste a custom decklist and score it with the same sealed grading model."
            checklistItems={[
              '1. Use main deck only (Sideboard ignored).',
              '2. You can include lands or only spells.',
              '3. Scores use the same axes as optimizer builds.',
              '4. Result is saved as a User Deck tab.',
            ]}
            inputLabel="Custom Decklist"
            placeholder="Deck\n1 Card Name\n..."
            analyzeLabel="Test Deck"
            formatOptions={SEALED_FORMAT_OPTIONS.filter((o) => o.value === pool.analysisFormat)}
          />
        )}
      </AnimatePresence>

      {/* Card zoom */}
      <CardZoomOverlay
        cardName={zoomedCardName}
        onClose={() => {
          analysis.setZoomedCardName(null);
          pool.setZoomedCardName(null);
        }}
      />
    </>
  );
};
