import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Network, Palette, Trophy, Loader2, Info, Maximize2 } from 'lucide-react';
import { FORMAT_OPTIONS, PAIRS, TRIOS } from '../../constants';
import { getCardImage, sortColorsWUBRG } from '../../utils/helpers';
import { useTrophyDeckMap, useTrophyDeckCardlist, type TrophyMapPoint } from '../../queries/useTrophyDeckMap';

interface TrophyMapOverlayProps {
  activeSet: string;
  activeFormat: string;
  onClose: () => void;
}

type ColorMode = 'archetype' | 'cluster';

const COLOR_RGB: Record<string, [number, number, number]> = {
  W: [245, 240, 210], U: [56, 132, 246], B: [150, 100, 230], R: [239, 68, 68], G: [52, 199, 99],
};

const GUILD_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  [...PAIRS, ...TRIOS].forEach(p => { map[sortColorsWUBRG(p.code)] = p.name.replace(/\s*\(.*\)$/, ''); });
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

// Ticks "ronds" pour les axes
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range || 1));
  const frac = (range || 1) / Math.pow(10, exp);
  let nf: number;
  if (round) nf = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  else nf = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}
function niceTicks(min: number, max: number, count: number): number[] {
  const step = niceNum((max - min) / Math.max(count - 1, 1), true) || 1;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const MIN_ZOOM = 1, MAX_ZOOM = 14;

export const TrophyMapOverlay: React.FC<TrophyMapOverlayProps> = ({ activeSet, activeFormat, onClose }) => {
  const { data: points = [], isLoading } = useTrophyDeckMap(activeSet, activeFormat);
  const [colorMode, setColorMode] = useState<ColorMode>('archetype');
  const [selected, setSelected] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [isTransformed, setIsTransformed] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; point: TrophyMapPoint } | null>(null);

  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixelsRef = useRef<Array<{ px: number; py: number }>>([]);
  const hoverIdxRef = useRef<number>(-1);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Transform (source de vérité = refs, pour un rendu impératif fluide)
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({ active: false, lastX: 0, lastY: 0, moved: false });

  const formatLabel = FORMAT_OPTIONS.find(o => o.value === activeFormat)?.label || activeFormat;

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
      if (g) g.count++; else groups.set(key, { label, color, count: 1 });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 14);
  }, [points, colorMode, clusterCount]);

  // --- Rendu du nuage (offscreen, device pixels, axes + transform) ---
  const renderBase = useCallback(() => {
    if (!bounds || dims.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(dims.w * dpr), H = Math.round(dims.h * dpr);
    let base = baseRef.current;
    if (!base) { base = document.createElement('canvas'); baseRef.current = base; }
    base.width = W; base.height = H;
    const ctx = base.getContext('2d');
    if (!ctx) return;

    const showAxes = dims.w >= 768;
    const mL = (showAxes ? 46 : 10) * dpr, mR = 12 * dpr, mT = 12 * dpr, mB = (showAxes ? 30 : 10) * dpr;
    const spanX = (bounds.maxX - bounds.minX) || 1;
    const spanY = (bounds.maxY - bounds.minY) || 1;
    const sx = (W - mL - mR) / spanX;
    const sy = (H - mT - mB) / spanY;
    const zoom = zoomRef.current, pan = panRef.current;

    // data -> écran (fit puis transform)
    const toX = (vx: number) => (mL + (vx - bounds.minX) * sx) * zoom + pan.x;
    const toY = (vy: number) => (H - mB - (vy - bounds.minY) * sy) * zoom + pan.y;

    // --- Axes / grille ---
    if (showAxes) {
      ctx.lineWidth = 1 * dpr;
      ctx.font = `${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const xticks = niceTicks(bounds.minX, bounds.maxX, 8);
      const yticks = niceTicks(bounds.minY, bounds.maxY, 8);
      ctx.textAlign = 'center';
      for (const v of xticks) {
        const x = toX(v);
        if (x < mL || x > W - mR) continue;
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, H - mB); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.fillText(v.toFixed(1), x, H - mB + 14 * dpr);
      }
      ctx.textAlign = 'right';
      for (const v of yticks) {
        const y = toY(v);
        if (y < mT || y > H - mB) continue;
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(W - mR, y); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.fillText(v.toFixed(1), mL - 6 * dpr, y);
      }
      // Cadre
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.strokeRect(mL, mT, W - mL - mR, H - mT - mB);
      // Titres
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = `700 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('UMAP 1', (mL + W - mR) / 2, H - 8 * dpr);
      ctx.save();
      ctx.translate(13 * dpr, (mT + H - mB) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText('UMAP 2', 0, 0);
      ctx.restore();
    }

    // --- Points ---
    const radius = (points.length > 5000 ? 2.2 : points.length > 1500 ? 2.8 : 3.6) * dpr;
    const pixels: Array<{ px: number; py: number }> = new Array(points.length);
    ctx.globalAlpha = 0.82;
    points.forEach((p, i) => {
      const px = toX(p.x), py = toY(p.y);
      pixels[i] = { px, py };
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(p);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    pixelsRef.current = pixels;
  }, [points, bounds, dims, colorOf]);

  const composite = useCallback(() => {
    const main = mainRef.current, base = baseRef.current;
    if (!main || !base || dims.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(dims.w * dpr), H = Math.round(dims.h * dpr);
    if (main.width !== W) main.width = W;
    if (main.height !== H) main.height = H;
    const ctx = main.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);

    const radius = (points.length > 5000 ? 2.2 : points.length > 1500 ? 2.8 : 3.6) * dpr;
    const ring = (idx: number, color: string, extra: number, width: number) => {
      const px = pixelsRef.current[idx];
      if (!px) return;
      ctx.beginPath();
      ctx.arc(px.px, px.py, radius + extra, 0, Math.PI * 2);
      ctx.lineWidth = width * dpr;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    const selIdx = selected ? points.findIndex(p => p.aggregate_id === selected) : -1;
    if (selIdx >= 0) ring(selIdx, '#ffffff', 4 * dpr, 2.5);
    if (hoverIdxRef.current >= 0 && hoverIdxRef.current !== selIdx) ring(hoverIdxRef.current, 'rgba(255,255,255,0.85)', 3 * dpr, 2);
  }, [points, dims, selected]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; renderBase(); composite(); });
  }, [renderBase, composite]);

  useEffect(() => { renderBase(); composite(); }, [renderBase, composite]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setDims(prev => (Math.abs(prev.w - r.width) > 1 || Math.abs(prev.h - r.height) > 1) ? { w: r.width, h: r.height } : prev);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom molette (vers le curseur) — listener natif non-passif
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * dpr, cy = (e.clientY - rect.top) * dpr;
      const z = zoomRef.current, pan = panRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      if (nz === z) return;
      // garde le point sous le curseur fixe
      const wx = (cx - pan.x) / z, wy = (cy - pan.y) / z;
      let nx = cx - wx * nz, ny = cy - wy * nz;
      if (nz === MIN_ZOOM) { nx = 0; ny = 0; }
      zoomRef.current = nz; panRef.current = { x: nx, y: ny };
      setIsTransformed(nz !== 1);
      scheduleRender();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [scheduleRender]);

  const resetView = () => {
    zoomRef.current = 1; panRef.current = { x: 0, y: 0 };
    setIsTransformed(false);
    renderBase(); composite();
  };

  const hitTest = (clientX: number, clientY: number): number => {
    const main = mainRef.current;
    if (!main) return -1;
    const rect = main.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (clientX - rect.left) * dpr, my = (clientY - rect.top) * dpr;
    const thr = (9 * dpr) ** 2;
    let best = -1, bestDist = thr;
    const px = pixelsRef.current;
    for (let i = 0; i < px.length; i++) {
      const d = (px[i].px - mx) ** 2 + (px[i].py - my) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  };

  const onDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false };
  };
  const onMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.active) {
      const dpr = window.devicePixelRatio || 1;
      const dx = (e.clientX - drag.lastX) * dpr, dy = (e.clientY - drag.lastY) * dpr;
      if (Math.abs(e.clientX - drag.lastX) + Math.abs(e.clientY - drag.lastY) > 3) drag.moved = true;
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      if (zoomRef.current > 1) setIsTransformed(true);
      if (hoverInfo) setHoverInfo(null);
      scheduleRender();
      return;
    }
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIdxRef.current) { hoverIdxRef.current = idx; composite(); }
    if (idx >= 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setHoverInfo({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: points[idx] });
    } else if (hoverInfo) setHoverInfo(null);
  };
  const onUp = () => { dragRef.current.active = false; };
  const onLeave = () => { dragRef.current.active = false; hoverIdxRef.current = -1; setHoverInfo(null); composite(); };
  const onClick = (e: React.MouseEvent) => {
    if (dragRef.current.moved) return; // c'était un pan
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0) setSelected(points[idx].aggregate_id);
  };

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
          <button onClick={() => setShowInfo(s => !s)} title="How to read this map"
            className={`p-2 rounded-lg border transition-colors ${showInfo ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
            <Info size={16} />
          </button>
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
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas ref={mainRef} style={{ width: dims.w, height: dims.h, touchAction: 'none' }}
          className={points.length > 0 && !isLoading ? (dragRef.current.active ? 'cursor-grabbing' : 'cursor-grab') : 'pointer-events-none'}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave} onClick={onClick} onDoubleClick={resetView} />

        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
            <div className="relative w-14 h-14">
              <Loader2 className="animate-spin text-indigo-400 absolute inset-0 m-auto" size={56} strokeWidth={1.2} />
              <Network className="text-indigo-300 absolute inset-0 m-auto" size={20} />
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Projecting decks…</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && points.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
            <Trophy size={40} className="text-slate-800" />
            <p className="text-sm font-bold">No map data yet for this format.</p>
            <p className="text-[11px] text-slate-600 max-w-sm">The map is precomputed by the ETL (<code className="text-indigo-400">etl_umap_trophymap.py</code>).</p>
          </div>
        )}

        {/* Reset view */}
        {isTransformed && !isLoading && (
          <button onClick={resetView} title="Reset view (double-click)"
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
            <Maximize2 size={13} /> Reset
          </button>
        )}

        {/* Légende */}
        {!isLoading && points.length > 0 && (
          <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-xl p-3 max-w-[180px] max-h-[55%] overflow-y-auto no-scrollbar shadow-2xl">
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
        )}

        {/* Tooltip survol */}
        {hoverInfo && (
          <div className="absolute pointer-events-none z-10 bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 shadow-xl"
            style={{ left: Math.min(hoverInfo.x + 14, dims.w - 160), top: Math.max(hoverInfo.y - 10, 8) }}>
            <p className="text-[11px] font-black text-white truncate max-w-[150px]">{labelForColors(hoverInfo.point.colors)}</p>
            <p className="text-[9px] text-slate-400 font-bold">{colorMode === 'cluster' ? (hoverInfo.point.cluster_label || `Cluster ${hoverInfo.point.cluster}`) : `${hoverInfo.point.wins ?? 7}-win trophy deck`} · click to open</p>
          </div>
        )}

        {/* Panneau méthodologie */}
        <AnimatePresence>
          {showInfo && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-3 left-3 right-3 md:right-auto md:max-w-md bg-slate-900/95 backdrop-blur-sm border border-indigo-500/30 rounded-xl p-4 shadow-2xl z-10">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">How to read this map</h3>
                <button onClick={() => setShowInfo(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                <li>• <strong className="text-slate-200">Each dot</strong> = one real trophy deck (a 7-win run on 17Lands).</li>
                <li>• <strong className="text-slate-200">Distance</strong> is what matters: nearby decks share many cards, far-apart decks are very different. The UMAP axes themselves have <em>no</em> intrinsic meaning.</li>
                <li>• <strong className="text-indigo-300">Archetype</strong> mode colors dots by the deck's color identity (its guild).</li>
                <li>• <strong className="text-indigo-300">Clusters</strong> mode colors dots by groups of similar decks found automatically — to spot <em>sub-archetypes</em> (e.g. aggro vs midrange within the same colors).</li>
                <li>• <strong className="text-slate-200">Scroll</strong> to zoom, <strong className="text-slate-200">drag</strong> to pan, double-click to reset.</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Panneau decklist */}
        <AnimatePresence>
          {selected && <DeckListPanel aggregateId={selected} point={points.find(p => p.aggregate_id === selected) || null} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ------------------------------------------------------------------
const DeckListPanel: React.FC<{ aggregateId: string; point: TrophyMapPoint | null; onClose: () => void }> = ({ aggregateId, point, onClose }) => {
  const { data: cardlist = {}, isLoading } = useTrophyDeckCardlist(aggregateId);
  const cards = useMemo(() => Object.entries(cardlist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [cardlist]);
  const total = cards.reduce((a, [, q]) => a + q, 0);
  const guild = labelForColors(point?.colors || null);

  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="absolute top-0 right-0 bottom-0 w-full sm:w-[380px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-20">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-0.5">🏆 Trophy decklist</p>
          <p className="text-base font-black text-white truncate leading-tight">{guild}</p>
          <p className="text-[10px] text-slate-500 font-bold">{point?.wins ?? 7}-win run · {total} cards{point?.archetype && point.archetype !== guild ? ` · ${point.archetype}` : ''}</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg flex-shrink-0 ml-2"><X size={16} /></button>
      </div>
      <p className="px-4 py-2 text-[10px] text-slate-500 leading-snug border-b border-slate-800/60">
        A real deck a player went <span className="text-amber-300 font-bold">7 wins</span> with. Cards below are its exact maindeck.
      </p>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={24} /></div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {cards.map(([name, qty]) => (
              <div key={name} className="relative rounded-md overflow-hidden border border-slate-800 bg-black">
                <img src={getCardImage(name)} alt={name} loading="lazy" className="w-full aspect-[63/88] object-cover" />
                {qty > 1 && <span className="absolute top-0.5 right-0.5 bg-slate-950/90 text-white text-[9px] font-black px-1 py-0.5 rounded border border-white/20">×{qty}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
