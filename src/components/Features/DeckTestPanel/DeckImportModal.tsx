import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { FORMAT_OPTIONS } from '../../../constants';
import type { FormatOption } from '../../../types';

interface DeckImportModalProps {
  analysisFormat: string;
  deckImportText: string;
  importError: string | null;
  isAnalyzingDeck: boolean;
  onFormatChange: (format: string) => void;
  onTextChange: (text: string) => void;
  onAnalyze: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  checklistItems?: string[];
  inputLabel?: string;
  placeholder?: string;
  analyzeLabel?: string;
  formatOptions?: FormatOption[];
}

export const DeckImportModal: React.FC<DeckImportModalProps> = ({
  analysisFormat,
  deckImportText,
  importError,
  isAnalyzingDeck,
  onFormatChange,
  onTextChange,
  onAnalyze,
  onClose,
  title = 'Test My Deck',
  subtitle = 'Paste an MTGA decklist, choose format, then run a visual fit audit.',
  checklistItems = [
    '1. Keep the `Deck` header.',
    '2. Include Sideboard to unlock Potential Adds.',
    '3. One decklist per run.',
    '4. Confirm format before analysis.',
  ],
  inputLabel = 'MTGA Import',
  placeholder = 'Deck\n1 Card Name (SET) 123\n...\n\nSideboard\n...',
  analyzeLabel = 'Analyze Deck',
  formatOptions = FORMAT_OPTIONS,
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm p-3 md:p-6 flex items-center justify-center"
  >
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      className="w-full max-w-4xl bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg md:text-xl font-black tracking-tight text-white uppercase">
            {title}
          </h3>
          <p className="text-[11px] md:text-xs text-slate-400 mt-1">
            {subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr]">
        <div className="bg-slate-950/40 border-r border-slate-800 p-4 md:p-5 space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Checklist
          </p>
          <ul className="space-y-2 text-[11px] text-slate-400">
            {checklistItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Format
            </label>
            <select
              value={analysisFormat}
              onChange={(e) => onFormatChange(e.target.value)}
              className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {formatOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-3">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {inputLabel}
          </label>
          <textarea
            value={deckImportText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[230px] md:min-h-[300px] bg-slate-950/70 border border-slate-700 rounded-2xl p-3 md:p-4 text-xs md:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
          />
          {importError && (
            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {importError}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 md:px-6 pb-5 md:pb-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzingDeck}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-2"
        >
          <Sparkles size={12} />
          {isAnalyzingDeck ? 'Analyzing...' : analyzeLabel}
        </button>
      </div>
    </motion.div>
  </motion.div>
);
