import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Network, Palette, Trophy, Loader2, Info } from 'lucide-react';
import { FORMAT_OPTIONS, PAIRS, TRIOS } from '../../constants';
import { getCardImage, sortColorsWUBRG } from '../../utils/helpers';
import { useTrophyDeckMap, useTrophyDeckCardlist, type TrophyMapPoint } from '../../queries/useTrophyDeckMap';

interface TrophyMapOverlayProps {
  activeSet: string;
  activeFormat: string;
  onClose: () => void;
}

type ColorMode = 'archetype' | 'cluster';

// --- Couleurs ---
const COLOR_RGB: Record<string, [number, number, number]> = {
  W: [245, 240, 210], U: [56, 132, 246], B: [150, 100, 230], R: [239, 68, 68], G: [52, 199, 99],
};

// Nom de guilde / triome à partir du code couleur (pour la légende)
const GUILD_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  [...PAIRS, ...TRIOS].forEach(p => {
    const code = sortColorsWUBRG(p.code);
    map[code] = p.name.replace(/\s*\(.*\)$/, '');
  });
  return map;
})();

function archetypeRgb(colors: string | null): [number, number, number] {
  const letters = (colors || '').split('').filter(c => 'WUBRG'.includes(c));
  if (letters.length === 0) return [148, 163, 184];
  const sum: [number, number, number] = [0, 0, 0];
  letters.forEach(l => { const c = COLOR_RGB[l]; sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; });
  return [Math.round(sum[0] / letters.length), Math.round(sum[1] / letters.length), Math.round(sum[2] / letters.length)];
}

function clusterCss(id: number, total: number): string {
  const hue = Math.round((id * 360) / Math.max(total, 1)) % 360;
  return `hsl(${hue}, 68%, 62%)`;
}

function labelForColors(colors: string | null): string {
  const code = sortColorsWUBRG(colors || '');
  if (!code) return 'Colorless';
  if (GUILD_NAMES[code]) return GUILD_NAMES[code];
  if (code.length === 1) return ({ W: 'Mono White', U: 'Mono Blue', B: 'Mono Black', R: 'Mono Red', G: 'Mono Green' } as Record<string, string>)[code];
  return code;
}

export const TrophyMapOverlay: React.FC<TrophyMapOverlayProps> = ({ activeSet, activeFormat, onClose }) => {
  const { data: points = [], isLoading } = useTrophyDeckMap(activeSet, activeFormat);
  const [colorMode, setColorMode] = useState<ColorMode>('archetype');
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; point: TrophyMapPoint } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixelsRef = useRef<Array<{ px: number; py: number; i: number }>>([]);
  const hoverIdxRef = useRef<number>(-1);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const formatLabel = FORMAT_OPTIONS.find(o => o.value === activeFormat)?.label || activeFormat;

  // Bornes des coordonnées
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }, [points]);

  const clusterCount = useMemo(() => {
    let max = 0;
    for (const p of points) if ((p.cluster ?? 0) > max) max = p.cluster ?? 0;
    return max + 1;
  }, [points]);

  const colorOf = useCallback((p: TrophyMapPoint): string => {
    if (colorMode === 'cluster') return clusterCss(p.cluster ?? 0, clusterCount);
    const [r, g, b] = archetypeRgb(p.colors);
    return `rgb(${r},${g},${b})`;
  }, [colorMode, clusterCount]);

  // Légende
  const legend = useMemo(() => {
    const groups = new Map<string, { label: string; color: string; count: number }>();
    for (const p of points) {
      let key: string, label: string, color: string;
      if (colorMode === 'cluster') {
        key = `c${p.cluster ?? 0}`;
        label = p.cluster_label || `Cluster ${p.cluster ?? 0}`;
        color = clusterCss(p.cluster ?? 0, clusterCount);
      } else {
        key = sortColorsWUBRG(p.colors || '') || '∅';
        label = labelForColors(p.colors);
        const [r, g, b] = archetypeRgb(p.colors);
        color = `rgb(${r},${g},${b})`;
      }
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { label, color, count: 1 });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 14);
  }, [points, colorMode, clusterCount]);

  // Dessin du nuage
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds || dims.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = dims;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = 48;
    const spanX = (bounds.maxX - bounds.minX) || 1;
    const spanY = (bounds.maxY - bounds.minY) || 1;
    const sx = (w - pad * 2) / spanX;
    const sy = (h - pad * 2) / spanY;

    const pixels: Array<{ px: number; py: number; i: number }> = [];
    const radius = points.length > 1500 ? 2.6 : points.length > 600 ? 3.2 : 4;

    points.forEach((p, i) => {
      const px = pad + (p.x - bounds.minX) * sx;
      const py = h - (pad + (p.y - bounds.minY) * sy); // flip Y
      pixels.push({ px, py, i });
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(p);
      ctx.globalAlpha = 0.78;
      ctx.fill();
    });
    pixelsRef.current = pixels;

    // Survol / sélection : halo
    ctx.globalAlpha = 1;
    const highlight = (idx: number, ring: string, rad: number) => {
      const px = pad + (points[idx].x - bounds.minX) * sx;
      const py = h - (pad + (points[idx].y - bounds.minY) * sy);
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = ring;
      ctx.stroke();
    };
    const selIdx = selected ? points.findIndex(p => p.aggregate_id === selected) : -1;
    if (selIdx >= 0) highlight(selIdx, '#ffffff', radius + 4);
    if (hoverIdxRef.current >= 0 && hoverIdxRef.current !== selIdx) highlight(hoverIdxRef.current, 'rgba(255,255,255,0.7)', radius + 3);
  }, [points, bounds, dims, colorOf, selected]);

  useEffect(() => { draw(); }, [draw]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = -1, bestDist = 100;
    for (const { px, py, i } of pixelsRef.current) {
      const d = (px - mx) ** 2 + (py - my) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  const onMove = (e: React.MouseEvent) => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIdxRef.current) {
      hoverIdxRef.current = idx;
      draw();
    }
    if (idx >= 0) {
      const rect = containerRef.current!.getBoundingClientRect();
      setHoverInfo({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: points[idx] });
    } else setHoverInfo(null);
  };

  const onLeave = () => { hoverIdxRef.current = -1; setHoverInfo(null); draw(); };
  const onClick = (e: React.MouseEvent) => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0) setSelected(points[idx].aggregate_id);
  };

  // Esc pour fermer
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (selected) setSelected(null); else onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Network className="text-indigo-400 shrink-0" size={22} />
          <div className="min-w-0">
            <h2 className="text-sm md:text-lg font-black text-white tracking-tight truncate">TROPHIES MAP</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{activeSet} · {formatLabel} · {points.length} decks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button onClick={() => setColorMode('archetype')} className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-wide transition-all ${colorMode === 'archetype' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              <Palette size={12} /> Archetype
            </button>
            <button onClick={() => setColorMode('cluster')} className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-wide transition-all ${colorMode === 'cluster' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              <Network size={12} /> Clusters
            </button>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"><X size={18} /></button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <p className="text-xs font-bold uppercase tracking-widest">Loading map…</p>
          </div>
        ) : points.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
            <Trophy size={40} className="text-slate-800" />
            <p className="text-sm font-bold">No map data yet for this format.</p>
            <p className="text-[11px] text-slate-600 max-w-sm">The map is precomputed by the ETL. Run <code className="text-indigo-400">etl_umap_trophymap.py</code> once trophy decks are scraped.</p>
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0 cursor-crosshair">
            <canvas ref={canvasRef} style={{ width: dims.w, height: dims.h }} onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} />

            {/* Légende */}
            <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-xl p-3 max-w-[180px] max-h-[60%] overflow-y-auto no-scrollbar shadow-2xl">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{colorMode === 'cluster' ? 'Clusters' : 'Archetypes'}</p>
              <div className="space-y-1">
                {legend.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="text-[10px] text-slate-300 font-bold truncate flex-1">{l.label}</span>
                    <span className="text-[9px] text-slate-600 font-mono">{l.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Aide axes */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-lg px-2.5 py-1.5 max-w-[60%]">
              <Info size={11} className="flex-shrink-0" />
              <span className="leading-snug">Proximity = similar card composition. Axes have no meaning.</span>
            </div>

            {/* Tooltip survol */}
            {hoverInfo && (
              <div className="absolute pointer-events-none z-10 bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 shadow-xl"
                style={{ left: Math.min(hoverInfo.x + 14, dims.w - 150), top: Math.max(hoverInfo.y - 10, 8) }}>
                <p className="text-[11px] font-black text-white truncate max-w-[140px]">{hoverInfo.point.archetype || 'Unknown'}</p>
                <p className="text-[9px] text-slate-400 font-bold">{colorMode === 'cluster' ? (hoverInfo.point.cluster_label || `Cluster ${hoverInfo.point.cluster}`) : labelForColors(hoverInfo.point.colors)} · click to view</p>
              </div>
            )}
          </div>
        )}

        {/* Panneau decklist */}
        <AnimatePresence>
          {selected && <DeckListPanel aggregateId={selected} point={points.find(p => p.aggregate_id === selected) || null} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ------------------------------------------------------------------
// Panneau latéral : decklist du deck sélectionné
// ------------------------------------------------------------------
const DeckListPanel: React.FC<{ aggregateId: string; point: TrophyMapPoint | null; onClose: () => void }> = ({ aggregateId, point, onClose }) => {
  const { data: cardlist = {}, isLoading } = useTrophyDeckCardlist(aggregateId);
  const cards = useMemo(() => Object.entries(cardlist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [cardlist]);

  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="absolute top-0 right-0 bottom-0 w-full sm:w-[360px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate">{point?.archetype || 'Trophy deck'}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{point?.wins ?? 7} wins · {cards.reduce((a, [, q]) => a + q, 0)} cards</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={24} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map(([name, qty]) => (
              <div key={name} className="relative rounded-lg overflow-hidden border border-slate-800 bg-black">
                <img src={getCardImage(name)} alt={name} loading="lazy" className="w-full aspect-[63/88] object-cover" />
                {qty > 1 && <span className="absolute top-1 right-1 bg-slate-950/90 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md border border-white/20">×{qty}</span>}
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent text-white text-[8px] font-bold px-1 pb-1 pt-3 truncate leading-none">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
