import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Network, Trophy, Loader2, Info, Maximize2, Sparkles, Search, List, ChevronUp, Play, Pause, Layers } from 'lucide-react';
import { FORMAT_OPTIONS, PAIRS, TRIOS } from '../../constants';
import { getCardImage, sortColorsWUBRG } from '../../utils/helpers';
import CardImage from '../Common/CardImage';
import { useDebounce } from '../../hooks/useDebounce';
import { useTrophyDeckMap, useTrophyDeckCardlist, type TrophyMapPoint } from '../../queries/useTrophyDeckMap';
import { useTrophyArchetypeCards, useDecksWithCard, useSetCardNames } from '../../queries/useTrophyClusters';
import type { ArchetypalSkeleton } from '../../queries/useSkeletons';
import { COLOR_MODES, buildColorScale, buildTimeline, buildDensityLayers, scaleColor, type ColorMode } from '../../utils/trophyMapViz';

interface TrophyMapOverlayProps {
  activeSet: string;
  activeFormat: string;
  skeletons: ArchetypalSkeleton[];
  onClose: () => void;
}

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
function labelForColors(colors: string | null): string {
  const code = sortColorsWUBRG(colors || '');
  if (!code) return 'Colorless';
  if (GUILD_NAMES[code]) return GUILD_NAMES[code];
  if (code.length === 1) return ({ W: 'Mono White', U: 'Mono Blue', B: 'Mono Black', R: 'Mono Red', G: 'Mono Green' } as Record<string, string>)[code];
  return code;
}
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

export const TrophyMapOverlay: React.FC<TrophyMapOverlayProps> = ({ activeSet, activeFormat, skeletons, onClose }) => {
  const { data: points = [], isLoading } = useTrophyDeckMap(activeSet, activeFormat);
  const { data: archCards = {} } = useTrophyArchetypeCards(activeSet, activeFormat);
  const { data: cardNames = [] } = useSetCardNames(activeSet);

  const [showArch, setShowArch] = useState(false);
  const [selected, setSelected] = useState<TrophyMapPoint | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [isTransformed, setIsTransformed] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; point: TrophyMapPoint } | null>(null);
  const [cardInput, setCardInput] = useState('');
  const [activeColors, setActiveColors] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('archetype');
  // Zones de densité : jamais par défaut, la carte reste un nuage de points.
  const [showDensity, setShowDensity] = useState(false);
  // Curseur de temps : null = tous les decks ; sinon la semaine choisie, ou
  // toutes les semaines jusqu'à elle en mode cumulé.
  const [timeWeek, setTimeWeek] = useState<number | null>(null);
  const [cumulative, setCumulative] = useState(false);
  const [playing, setPlaying] = useState(false);

  const namesSet = useMemo(() => new Set(cardNames), [cardNames]);
  const debouncedCard = useDebounce(cardInput, 250);
  const searchCard = useMemo(() => (namesSet.has(debouncedCard) ? debouncedCard : ''), [debouncedCard, namesSet]);
  const { data: cardDecks } = useDecksWithCard(activeSet, activeFormat, searchCard || null);

  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixelsRef = useRef<Array<{ px: number; py: number }>>([]);
  const hoverIdxRef = useRef<number>(-1);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({ active: false, lastX: 0, lastY: 0, moved: false });

  const formatLabel = FORMAT_OPTIONS.find(o => o.value === activeFormat)?.label || activeFormat;

  const realPoints = useMemo(() => points.filter(p => !p.is_archetypal), [points]);
  const hasArch = useMemo(() => points.some(p => p.is_archetypal), [points]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }, [points]);

  // Modes "Color by" proposés uniquement si l'ETL a rempli la mesure.
  const availableModes = useMemo(
    () => COLOR_MODES.filter(m => realPoints.some(p => m.value(p) != null)),
    [realPoints],
  );
  const scale = useMemo(() => {
    const def = availableModes.find(m => m.key === colorMode);
    return def ? buildColorScale(def, realPoints) : null;
  }, [availableModes, colorMode, realPoints]);

  const colorOf = useCallback((p: TrophyMapPoint): string => {
    if (scale) return scale.colorOf(p) ?? 'rgb(71,85,105)';
    const [r, g, b] = archetypeRgb(p.colors);
    return `rgb(${r},${g},${b})`;
  }, [scale]);

  const timeline = useMemo(() => buildTimeline(points), [points]);
  const visible = useMemo<boolean[] | null>(() => {
    if (!timeline || timeWeek == null) return null;
    return timeline.weekOf.map(w => w != null && (cumulative ? w <= timeWeek : w === timeWeek));
  }, [timeline, timeWeek, cumulative]);
  const isVisible = useCallback((i: number) => !visible || visible[i], [visible]);
  const visibleCount = useMemo(
    () => (visible ? points.reduce((n, p, i) => n + (!p.is_archetypal && visible[i] ? 1 : 0), 0) : realPoints.length),
    [visible, points, realPoints],
  );

  // Lecture : une semaine toutes les 0,9 s, arrêt sur la dernière.
  useEffect(() => {
    if (!playing || !timeline) return;
    const last = timeline.weekStarts.length - 1;
    const id = window.setInterval(() => {
      setTimeWeek(w => {
        const next = w == null ? 0 : w + 1;
        if (next >= last) { setPlaying(false); return last; }
        return next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, timeline]);

  const densityLayers = useMemo(() => {
    if (!showDensity || !bounds) return [];
    return buildDensityLayers(points, isVisible, bounds, p => sortColorsWUBRG(p.colors || '') || '-', p => archetypeRgb(p.colors));
  }, [showDensity, points, isVisible, bounds]);

  const legend = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; color: string; count: number }>();
    for (const p of realPoints) {
      const key = sortColorsWUBRG(p.colors || '') || '∅';
      const [r, g, b] = archetypeRgb(p.colors);
      const g2 = groups.get(key);
      if (g2) g2.count++; else groups.set(key, { key, label: labelForColors(p.colors), color: `rgb(${r},${g},${b})`, count: 1 });
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 16);
  }, [realPoints]);

  const highlightIds = useMemo<Set<string> | null>(() => {
    if (searchCard) return cardDecks ?? null;
    if (activeColors) {
      const s = new Set<string>();
      for (const p of realPoints) if ((sortColorsWUBRG(p.colors || '') || '∅') === activeColors) s.add(p.aggregate_id);
      return s;
    }
    return null;
  }, [searchCard, cardDecks, activeColors, realPoints]);

  const activeArchCards = useMemo(() => (activeColors ? archCards[activeColors] || null : null), [activeColors, archCards]);

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
    const spanX = (bounds.maxX - bounds.minX) || 1, spanY = (bounds.maxY - bounds.minY) || 1;
    const sx = (W - mL - mR) / spanX, sy = (H - mT - mB) / spanY;
    const zoom = zoomRef.current, pan = panRef.current;
    const toX = (vx: number) => (mL + (vx - bounds.minX) * sx) * zoom + pan.x;
    const toY = (vy: number) => (H - mB - (vy - bounds.minY) * sy) * zoom + pan.y;

    if (showAxes) {
      ctx.lineWidth = 1 * dpr;
      ctx.font = `${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (const v of niceTicks(bounds.minX, bounds.maxX, 8)) {
        const x = toX(v); if (x < mL || x > W - mR) continue;
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, H - mB); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.55)'; ctx.fillText(v.toFixed(1), x, H - mB + 14 * dpr);
      }
      ctx.textAlign = 'right';
      for (const v of niceTicks(bounds.minY, bounds.maxY, 8)) {
        const y = toY(v); if (y < mT || y > H - mB) continue;
        ctx.strokeStyle = 'rgba(148,163,184,0.08)';
        ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(W - mR, y); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.55)'; ctx.fillText(v.toFixed(1), mL - 6 * dpr, y);
      }
      ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.strokeRect(mL, mT, W - mL - mR, H - mT - mB);
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = `700 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('UMAP 1', (mL + W - mR) / 2, H - 8 * dpr);
      ctx.save(); ctx.translate(13 * dpr, (mT + H - mB) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle'; ctx.fillText('UMAP 2', 0, 0); ctx.restore();
    }

    if (densityLayers.length) {
      // Les images de densité sont en coordonnées UMAP : on les étire sur la
      // zone du graphe, zoom et déplacement compris.
      const x0 = toX(bounds.minX), x1 = toX(bounds.maxX), y0 = toY(bounds.maxY), y1 = toY(bounds.minY);
      ctx.save();
      ctx.beginPath(); ctx.rect(mL, mT, W - mL - mR, H - mT - mB); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      for (const layer of densityLayers) ctx.drawImage(layer, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }

    const hl = highlightIds;
    const radius = (realPoints.length > 5000 ? 2.2 : realPoints.length > 1500 ? 2.8 : 3.6) * dpr;
    // En densité, les zones remplacent les points : superposés, ils les noyaient.
    const showDots = densityLayers.length === 0;
    const pixels: Array<{ px: number; py: number }> = new Array(points.length);
    points.forEach((p, i) => {
      const px = toX(p.x), py = toY(p.y);
      pixels[i] = { px, py };
      if (p.is_archetypal || !isVisible(i) || !showDots) return;
      const member = !hl || hl.has(p.aggregate_id);
      ctx.globalAlpha = member ? 0.85 : 0.05;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = member ? colorOf(p) : 'rgb(148,163,184)';
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    pixelsRef.current = pixels;

    if (showArch) {
      const ar = 7 * dpr;
      ctx.font = `800 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      points.forEach((p, i) => {
        if (!p.is_archetypal) return;
        const { px, py } = pixels[i];
        const [r, g, b] = archetypeRgb(p.colors);
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 * dpr;
        ctx.beginPath(); ctx.rect(-ar, -ar, ar * 2, ar * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        const label = labelForColors(p.colors);
        const tw = ctx.measureText(label).width;
        const lx = px + ar + 6 * dpr;
        ctx.fillStyle = 'rgba(2,6,23,0.82)'; ctx.fillRect(lx - 3 * dpr, py - 9 * dpr, tw + 6 * dpr, 18 * dpr);
        ctx.fillStyle = '#fff'; ctx.fillText(label, lx, py + dpr);
      });
    }
  }, [points, realPoints, bounds, dims, colorOf, showArch, highlightIds, densityLayers, isVisible]);

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
    const radius = (realPoints.length > 5000 ? 2.2 : realPoints.length > 1500 ? 2.8 : 3.6) * dpr;
    const ring = (idx: number, color: string, extra: number, width: number) => {
      const px = pixelsRef.current[idx]; if (!px) return;
      ctx.beginPath(); ctx.arc(px.px, px.py, radius + extra, 0, Math.PI * 2);
      ctx.lineWidth = width * dpr; ctx.strokeStyle = color; ctx.stroke();
    };
    const selIdx = selected ? points.findIndex(p => p.aggregate_id === selected.aggregate_id) : -1;
    if (selIdx >= 0) ring(selIdx, '#ffffff', 4 * dpr, 2.5);
    if (hoverIdxRef.current >= 0 && hoverIdxRef.current !== selIdx) ring(hoverIdxRef.current, 'rgba(255,255,255,0.85)', 3 * dpr, 2);
  }, [points, realPoints, dims, selected]);

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
    setIsTransformed(false); renderBase(); composite();
  };

  const hitTest = (clientX: number, clientY: number): number => {
    const main = mainRef.current; if (!main) return -1;
    const rect = main.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (clientX - rect.left) * dpr, my = (clientY - rect.top) * dpr;
    const px = pixelsRef.current;
    if (showArch) {
      let best = -1, bd = (13 * dpr) ** 2;
      for (let i = 0; i < points.length; i++) {
        if (!points[i].is_archetypal || !px[i]) continue;
        const d = (px[i].px - mx) ** 2 + (px[i].py - my) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
    let best = -1, bd = (9 * dpr) ** 2;
    for (let i = 0; i < points.length; i++) {
      if (points[i].is_archetypal || !px[i] || !isVisible(i) || showDensity) continue;
      const d = (px[i].px - mx) ** 2 + (px[i].py - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const onDown = (e: React.MouseEvent) => { dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false }; };
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
    if (dragRef.current.moved) return;
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0) setSelected(points[idx]);
  };

  // --- Tactile (mobile) : 1 doigt = pan, 2 doigts = pinch-zoom, tap = sélection ---
  const touchRef = useRef<{ mode: 'none' | 'pan' | 'pinch'; lastX: number; lastY: number; dist: number; moved: boolean }>({ mode: 'none', lastX: 0, lastY: 0, dist: 0, moved: false });
  const touchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) touchRef.current = { mode: 'pan', lastX: e.touches[0].clientX, lastY: e.touches[0].clientY, dist: 0, moved: false };
    else if (e.touches.length >= 2) touchRef.current = { mode: 'pinch', lastX: 0, lastY: 0, dist: touchDist(e.touches), moved: true };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const tr = touchRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (tr.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = (t.clientX - tr.lastX) * dpr, dy = (t.clientY - tr.lastY) * dpr;
      if (Math.abs(t.clientX - tr.lastX) + Math.abs(t.clientY - tr.lastY) > 3) tr.moved = true;
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      tr.lastX = t.clientX; tr.lastY = t.clientY;
      if (zoomRef.current > 1) setIsTransformed(true);
      scheduleRender();
    } else if (tr.mode === 'pinch' && e.touches.length >= 2) {
      const canvas = mainRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * dpr;
      const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * dpr;
      const nd = touchDist(e.touches);
      const z = zoomRef.current, pan = panRef.current;
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * (nd / (tr.dist || nd))));
      const wx = (midX - pan.x) / z, wy = (midY - pan.y) / z;
      let nx = midX - wx * nz, ny = midY - wy * nz;
      if (nz === MIN_ZOOM) { nx = 0; ny = 0; }
      zoomRef.current = nz; panRef.current = { x: nx, y: ny };
      tr.dist = nd;
      setIsTransformed(nz !== 1);
      scheduleRender();
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const tr = touchRef.current;
    if (tr.mode === 'pan' && !tr.moved && e.changedTouches.length) {
      const t = e.changedTouches[0];
      const idx = hitTest(t.clientX, t.clientY);
      if (idx >= 0) setSelected(points[idx]);
    }
    if (e.touches.length === 0) touchRef.current = { mode: 'none', lastX: 0, lastY: 0, dist: 0, moved: false };
    else if (e.touches.length === 1) touchRef.current = { mode: 'pan', lastX: e.touches[0].clientX, lastY: e.touches[0].clientY, dist: 0, moved: true };
  };

  const onLegendClick = (key: string) => {
    setCardInput('');
    setActiveColors(prev => (prev === key ? null : key));
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else if (activeColors) setActiveColors(null);
      else if (cardInput) setCardInput('');
      else onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, activeColors, cardInput, onClose]);

  useEffect(() => { if (cardInput) setActiveColors(null); }, [cardInput]);

  const archCta = hasArch && (
    <button onClick={() => setShowArch(s => !s)} title="Overlay our archetypal skeletons"
      className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-lg border text-[9px] md:text-[10px] font-black uppercase tracking-wide transition-all ${showArch ? 'bg-amber-500/20 border-amber-400/50 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
      <Sparkles size={13} /> <span className="hidden md:inline">See archetypal</span><span className="md:hidden">Arch.</span>
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Network className="text-indigo-400 shrink-0" size={22} />
          <div className="min-w-0">
            <h2 className="text-sm md:text-lg font-black text-white tracking-tight truncate">TROPHIES MAP</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{activeSet} · {formatLabel} · {visible ? `${visibleCount} / ${realPoints.length}` : realPoints.length} decks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {archCta}
          <button onClick={() => setShowInfo(s => !s)} title="How to read this map"
            className={`p-2 rounded-lg border transition-colors ${showInfo ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
            <Info size={16} />
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"><X size={18} /></button>
        </div>
      </div>

      {/* Encodages : couleur, densité, temps */}
      {!isLoading && realPoints.length > 0 && (availableModes.length > 0 || timeline) && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3 px-4 md:px-6 py-2 border-b border-slate-800 flex-shrink-0">
          {availableModes.length > 0 && (
            <label className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-wide">
              Color by
              <select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-1.5 py-1 text-[10px] font-bold normal-case tracking-normal focus:outline-none focus:border-indigo-500">
                <option value="archetype">Archetype</option>
                {availableModes.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          )}
          <button onClick={() => setShowDensity(v => !v)} title="Smoothed areas where each archetype's decks concentrate"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[9px] md:text-[10px] font-black uppercase tracking-wide transition-all ${showDensity ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
            <Layers size={12} /> Density
          </button>
          {timeline && (
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <button onClick={() => { if (!playing && (timeWeek == null || timeWeek >= timeline.weekStarts.length - 1)) setTimeWeek(0); setPlaying(pl => !pl); }}
                title={playing ? 'Pause' : 'Play the format week by week'}
                className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 hover:text-white">
                {playing ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <input type="range" min={0} max={timeline.weekStarts.length} value={timeWeek == null ? timeline.weekStarts.length : timeWeek}
                onChange={e => { setPlaying(false); const v = Number(e.target.value); setTimeWeek(v >= timeline.weekStarts.length ? null : v); }}
                className="flex-1 accent-indigo-500" aria-label="Week" />
              <span className="text-[10px] font-bold text-slate-300 tabular-nums whitespace-nowrap w-[92px] text-right">
                {timeWeek == null ? 'All weeks' : `${cumulative ? 'Until' : 'Week of'} ${new Date(timeline.weekStarts[timeWeek]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
              </span>
              <button onClick={() => setCumulative(c => !c)} title="Show only the chosen week, or every week up to it"
                className={`px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wide ${cumulative ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}>
                {cumulative ? 'Cumulative' : 'Week only'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas ref={mainRef} style={{ width: dims.w, height: dims.h, touchAction: 'none' }}
          className={points.length > 0 && !isLoading ? (dragRef.current.active ? 'cursor-grabbing' : 'cursor-grab') : 'pointer-events-none'}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave} onClick={onClick} onDoubleClick={resetView}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />

        {/* Recherche de carte */}
        {!isLoading && points.length > 0 && (
          <div className="absolute top-3 left-3 z-10 w-[210px] max-w-[55vw]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input list="trophy-map-cards" value={cardInput} onChange={e => setCardInput(e.target.value)}
                placeholder="Highlight a card…"
                className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 py-2 pl-8 pr-7 rounded-lg text-[11px] font-bold focus:border-indigo-500 focus:outline-none shadow-lg" />
              {cardInput && <button onClick={() => setCardInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={13} /></button>}
              <datalist id="trophy-map-cards">{cardNames.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            {searchCard && (
              <div className="mt-1.5 text-[10px] font-bold bg-indigo-600/90 text-white rounded-md px-2 py-1 inline-block shadow">
                {cardDecks ? cardDecks.size : '…'} deck{(cardDecks?.size ?? 0) > 1 ? 's' : ''} play this
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
            <div className="relative w-14 h-14">
              <Loader2 className="animate-spin text-indigo-400 absolute inset-0 m-auto" size={56} strokeWidth={1.2} />
              <Network className="text-indigo-300 absolute inset-0 m-auto" size={20} />
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Projecting decks…</p>
          </div>
        )}

        {!isLoading && points.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
            <Trophy size={40} className="text-slate-800" />
            <p className="text-sm font-bold">No map data yet for this format.</p>
            <p className="text-[11px] text-slate-600 max-w-sm">The map is precomputed by the ETL (<code className="text-indigo-400">etl_umap_trophymap.py</code>).</p>
          </div>
        )}

        {isTransformed && !isLoading && (
          <button onClick={resetView} title="Reset view (double-click)"
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
            <Maximize2 size={13} /> Reset
          </button>
        )}

        {/* Légende cliquable (par archétype) — minimisable, repliée par défaut */}
        {!isLoading && points.length > 0 && (
          legendOpen ? (
            <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-xl p-3 w-[190px] max-h-[60%] overflow-y-auto no-scrollbar shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Archetypes</p>
                <div className="flex items-center gap-2">
                  {activeColors && <button onClick={() => setActiveColors(null)} className="text-[8px] font-black text-indigo-400 uppercase">Clear</button>}
                  <button onClick={() => setLegendOpen(false)} title="Minimize" className="text-slate-500 hover:text-white"><ChevronUp size={14} /></button>
                </div>
              </div>
              {scale && (
                <div className="mb-2 pb-2 border-b border-slate-800">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{scale.def.label}</p>
                  {scale.def.ordinal ? (
                    <div className="space-y-1">
                      {[0, 1, 2].map(v => (
                        <div key={v} className="flex items-center gap-2 px-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: scaleColor(v / 2) }} />
                          <span className="text-[10px] text-slate-300 font-bold">{scale.def.format(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${scaleColor(0)}, ${scaleColor(0.25)}, ${scaleColor(0.5)}, ${scaleColor(0.75)}, ${scaleColor(1)})` }} />
                      <div className="flex justify-between mt-1 text-[9px] text-slate-400 font-bold tabular-nums">
                        <span>{'≤'} {scale.def.format(scale.lo)}</span>
                        <span className="text-slate-500">{scale.def.format(scale.mid)}</span>
                        <span>{'≥'} {scale.def.format(scale.hi)}</span>
                      </div>
                      <p className="text-[8px] text-slate-600 mt-0.5">Middle = median deck</p>
                    </>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {legend.map((l) => {
                  const isActive = activeColors === l.key;
                  return (
                    <button key={l.key} onClick={() => onLegendClick(l.key)}
                      className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md transition-colors ${isActive ? 'bg-indigo-600/30' : 'hover:bg-slate-800/70'}`}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="text-[10px] text-slate-300 font-bold truncate flex-1 text-left">{l.label}</span>
                      <span className="text-[9px] text-slate-600 font-mono">{l.count}</span>
                    </button>
                  );
                })}
                {showArch && (
                  <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-slate-800 px-1.5">
                    <span className="w-2.5 h-2.5 rotate-45 bg-white flex-shrink-0" />
                    <span className="text-[10px] text-amber-300 font-bold truncate flex-1">◆ Archetypal deck</span>
                  </div>
                )}
              </div>
              <p className="text-[8px] text-slate-600 mt-2 leading-tight">Click an archetype to see its signature cards.</p>
            </div>
          ) : (
            <button onClick={() => setLegendOpen(true)}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/85 backdrop-blur-sm border border-slate-800 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-widest shadow-2xl">
              <List size={13} /> Legend
              {activeColors && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
            </button>
          )
        )}

        {hoverInfo && (
          <div className="absolute pointer-events-none z-10 bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 shadow-xl"
            style={{ left: Math.min(hoverInfo.x + 14, dims.w - 170), top: Math.max(hoverInfo.y - 10, 8) }}>
            <p className="text-[11px] font-black text-white truncate max-w-[160px]">{hoverInfo.point.is_archetypal ? '◆ ' : ''}{labelForColors(hoverInfo.point.colors)}</p>
            <p className="text-[9px] text-slate-400 font-bold">{hoverInfo.point.is_archetypal ? 'Archetypal skeleton' : hoverInfo.point.losses != null ? `${hoverInfo.point.wins ?? 7}-${hoverInfo.point.losses} trophy deck` : `${hoverInfo.point.wins ?? 7}-win trophy deck`} · click to open</p>
            {!hoverInfo.point.is_archetypal && (hoverInfo.point.rare_count != null || hoverInfo.point.avg_cmc != null || hoverInfo.point.trophy_time) && (
              <p className="text-[9px] text-slate-500 font-bold tabular-nums">
                {[
                  hoverInfo.point.rare_count != null ? `${hoverInfo.point.rare_count} rares` : null,
                  hoverInfo.point.avg_cmc != null ? `${hoverInfo.point.avg_cmc.toFixed(2)} avg MV` : null,
                  hoverInfo.point.trophy_time ? new Date(hoverInfo.point.trophy_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* Panneau cartes signature d'un archétype */}
        <AnimatePresence>
          {activeArchCards && (
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute top-0 left-0 bottom-0 w-full sm:w-[320px] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col z-20">
              <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Signature cards</p>
                  <p className="text-base font-black text-white truncate leading-tight">{labelForColors(activeColors)}</p>
                  <p className="text-[10px] text-slate-500 font-bold">{activeArchCards.size} trophy decks</p>
                </div>
                <button onClick={() => setActiveColors(null)} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg flex-shrink-0 ml-2"><X size={16} /></button>
              </div>
              <p className="px-4 py-2 text-[10px] text-slate-500 leading-snug border-b border-slate-800/60">
                Cards most <span className="text-indigo-300 font-bold">over-represented</span> in this archetype vs the format average.
              </p>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeArchCards.top_cards.length === 0 && <p className="text-center text-slate-600 text-xs py-8">No signature cards.</p>}
                {activeArchCards.top_cards.map((c) => (
                  <div key={c.name} className="flex items-center gap-2.5">
                    <CardImage src={getCardImage(c.name)} alt={c.name} className="w-9 h-[50px] rounded object-cover border border-slate-800 bg-black flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-slate-200 truncate">{c.name}</p>
                      <p className="text-[9px] text-slate-500 font-bold">in {Math.round(c.freq * 100)}% of decks · <span className="text-emerald-400">×{c.lift}</span> vs avg</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showInfo && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[92%] md:w-auto md:max-w-md bg-slate-900/95 backdrop-blur-sm border border-indigo-500/30 rounded-xl p-4 shadow-2xl z-30">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-[11px] font-black text-indigo-300 uppercase tracking-widest">How to read this map</h3>
                <button onClick={() => setShowInfo(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                <li>• <strong className="text-slate-200">Each dot</strong> = one real 7-win trophy deck. <strong className="text-slate-200">Distance</strong> = card similarity (UMAP axes are meaningless).</li>
                <li>• <strong className="text-slate-200">Color</strong> = the deck's color identity. Click an archetype in the legend to highlight it and see its <strong className="text-indigo-300">signature cards</strong>.</li>
                <li>• <strong className="text-slate-200">Color by</strong> switches to a measure of each deck: rares &amp; mythics, average mana value, losses. Blue = below the median deck, red = above, gray = typical (7-0 blue, 7-2 red).</li>
                <li>• <strong className="text-slate-200">Density</strong> shades where each archetype's decks concentrate (dots are hidden). The <strong className="text-slate-200">timeline</strong> replays the format week by week.</li>
                <li>• <strong className="text-indigo-300">Search a card</strong> (top-left) to highlight every deck that plays it.</li>
                <li>• <strong className="text-amber-300">◆ See archetypal</strong> overlays our skeletons. <strong className="text-slate-200">Scroll</strong> zoom · <strong className="text-slate-200">drag</strong> pan · double-click reset.</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selected && <DeckListPanel point={selected} skeletons={skeletons} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ------------------------------------------------------------------
const DeckListPanel: React.FC<{ point: TrophyMapPoint; skeletons: ArchetypalSkeleton[]; onClose: () => void }> = ({ point, skeletons, onClose }) => {
  const isArch = point.is_archetypal;
  const { data: fetched = {}, isLoading } = useTrophyDeckCardlist(isArch ? null : point.aggregate_id);
  const skelMap = useMemo(() => {
    if (!isArch) return {};
    const s = skeletons.find(sk => sk.archetype_name === point.archetype && !sk.is_alternative) || skeletons.find(sk => sk.archetype_name === point.archetype);
    if (!s) return {};
    const m: Record<string, number> = {};
    for (const c of s.deck_list || []) m[c.name] = (m[c.name] || 0) + 1;
    return m;
  }, [isArch, point, skeletons]);
  const cardlist = isArch ? skelMap : fetched;
  const cards = useMemo(() => Object.entries(cardlist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [cardlist]);
  const total = cards.reduce((a, [, q]) => a + q, 0);
  const guild = labelForColors(point.colors);
  const loading = isArch ? false : isLoading;

  return (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="absolute top-0 right-0 bottom-0 w-full sm:w-[380px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-30">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="min-w-0">
          {isArch
            ? <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">✦ Archetypal skeleton</p>
            : <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-0.5">🏆 Trophy decklist</p>}
          <p className="text-base font-black text-white truncate leading-tight">{point.archetype || guild}</p>
          <p className="text-[10px] text-slate-500 font-bold">{isArch ? `Synthetic skeleton · ${total} cards` : `${point.wins ?? 7}-win run · ${total} cards`}</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg flex-shrink-0 ml-2"><X size={16} /></button>
      </div>
      <p className="px-4 py-2 text-[10px] text-slate-500 leading-snug border-b border-slate-800/60">
        {isArch
          ? <>Our aggregated <span className="text-indigo-300 font-bold">ideal</span> decklist for this archetype, built from many trophy decks.</>
          : <>A real deck a player went <span className="text-amber-300 font-bold">7 wins</span> with. Cards below are its exact maindeck.</>}
      </p>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={24} /></div>
        ) : cards.length === 0 ? (
          <p className="text-center text-slate-600 text-xs py-12">Decklist unavailable.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {cards.map(([name, qty]) => (
              <div key={name} className="relative rounded-md overflow-hidden border border-slate-800 bg-black">
                <CardImage src={getCardImage(name)} alt={name} className="w-full aspect-[63/88] object-cover" />
                {qty > 1 && <span className="absolute top-0.5 right-0.5 bg-slate-950/90 text-white text-[9px] font-black px-1 py-0.5 rounded border border-white/20">×{qty}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
