import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCachedQuery } from '@/lib/queryCache';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface TickerTapeItem {
  ticker: string;
  price: number;
  currency: 'ARS' | 'USD';
  rsi: number;
  portfolios: string[];
}

/** Speed in px/s for the auto-scroll */
const SCROLL_SPEED = 50;

/** Pixels of pointer movement before a press becomes a drag (suppresses click) */
const DRAG_THRESHOLD_PX = 5;

/** Number of duplicated strips that make up the infinite marquee */
const COPY_COUNT = 6;

/** DOM id of the portaled tooltip (referenced via aria-describedby) */
const TOOLTIP_ID = 'ticker-tape-tooltip';

/** Estimated half-width (px) used to clamp the tooltip inside the viewport */
const TOOLTIP_HALF_WIDTH = 140;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fetcher: loads quotes + portfolio list, filters oversold, builds portfolio map */
async function fetchTickerTapeData(): Promise<TickerTapeItem[]> {
  const [quotesRes, pfRes] = await Promise.all([
    fetch('/api/cedears/quotes_json'),
    fetch('/api/portfolios/list_json')
  ]);

  // Propagate failures: an error state must be distinguishable from "no oversold tickers"
  if (!quotesRes.ok || !pfRes.ok) {
    throw new Error(`Error al cargar cotizaciones (quotes: ${quotesRes.status}, portfolios: ${pfRes.status})`);
  }

  const quotesData = await quotesRes.json();
  const pfData = await pfRes.json();

  const portfolios = pfData.portfolios || {};
  const portfolioMap: Record<string, string[]> = {};

  for (const [pfName, pfObj] of Object.entries(portfolios)) {
    const assets = (pfObj as any).assets || {};
    for (const tk of Object.keys(assets)) {
      if (!portfolioMap[tk]) portfolioMap[tk] = [];
      portfolioMap[tk].push(pfName);
    }
  }

  const quotes = quotesData.quotes || [];
  return quotes
    .filter((q: any) => q.rsi !== null && q.rsi <= 35)
    .map((q: any) => ({
      ticker: q.symbol,
      price: q.local || q.cedear_usd || 0,
      currency: (q.local !== null && q.local !== undefined) ? 'ARS' : 'USD',
      rsi: q.rsi,
      portfolios: portfolioMap[q.symbol] || []
    }))
    .sort((a: any, b: any) => a.rsi - b.rsi);
}

interface HoverInfo {
  item: TickerTapeItem;
  x: number;
  y: number;
  placeBelow: boolean;
}

const fmtPrice = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TickerTape() {
  const { data: oversoldTickers, loading, error } = useCachedQuery<TickerTapeItem[]>(
    'ticker-tape-oversold',
    fetchTickerTapeData,
    { ttl: 60, refetchInterval: 60 }
  );
  const openTickerDrawer = useAppStore((s) => s.openTickerDrawer);
  const [grabbing, setGrabbing] = useState(false);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const [reducedMotion] = useState(prefersReducedMotion);

  // --- drag + animation refs ---
  const stripRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);          // current translateX offset (px, negative = scrolled left)
  const rafRef = useRef<number>(0);     // requestAnimationFrame id
  const lastTimeRef = useRef<number>(0);
  const isDragging = useRef(false);
  const isPaused = useRef(false);       // hover OR keyboard focus pauses the auto-scroll
  const didDrag = useRef(false);        // a drag must not trigger the item click
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const hoverClearTimer = useRef<number>(0);

  const items = oversoldTickers ?? [];

  // ---- rAF auto-scroll loop ----
  const applyTransform = useCallback(() => {
    if (stripRef.current) {
      stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
    }
  }, []);

  const tick = useCallback((time: number) => {
    // While dragging, hovering/focused, or respecting reduced motion: skip auto-advance
    if (reducedMotion || isDragging.current || isPaused.current) {
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const dt = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;

    offsetRef.current -= SCROLL_SPEED * dt;

    // Wrap: when we've scrolled past one copy of the strip, reset to avoid float drift
    if (stripRef.current) {
      const oneSetWidth = stripRef.current.scrollWidth / COPY_COUNT;
      if (oneSetWidth > 0 && Math.abs(offsetRef.current) >= oneSetWidth) {
        offsetRef.current += oneSetWidth;
      }
    }

    applyTransform();
    rafRef.current = requestAnimationFrame(tick);
  }, [applyTransform, reducedMotion]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  useEffect(() => () => window.clearTimeout(hoverClearTimer.current), []);

  // ---- hover / focus: pause the strip and anchor the tooltip ----
  const handleBarPointerEnter = useCallback(() => {
    isPaused.current = true;
  }, []);

  const handleBarPointerLeave = useCallback(() => {
    isPaused.current = false;
    setHovered(null);
  }, []);

  const handleBarFocusCapture = useCallback(() => {
    isPaused.current = true;
  }, []);

  const handleBarBlurCapture = useCallback((e: React.FocusEvent) => {
    // Only resume when focus leaves the bar entirely (not between items)
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      isPaused.current = false;
      setHovered(null);
    }
  }, []);

  const anchorTooltip = useCallback((item: TickerTapeItem, el: HTMLElement) => {
    window.clearTimeout(hoverClearTimer.current);
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, TOOLTIP_HALF_WIDTH), window.innerWidth - TOOLTIP_HALF_WIDTH);
    setHovered({
      item,
      x,
      y: rect.top,
      placeBelow: rect.top < 90 // tooltip needs ~80px above the anchor
    });
  }, []);

  const handleItemEnter = useCallback((item: TickerTapeItem) => (e: React.PointerEvent) => {
    anchorTooltip(item, e.currentTarget as HTMLElement);
  }, [anchorTooltip]);

  const handleItemFocus = useCallback((item: TickerTapeItem) => (e: React.FocusEvent) => {
    anchorTooltip(item, e.currentTarget as HTMLElement);
  }, [anchorTooltip]);

  const handleItemLeave = useCallback(() => {
    // Deferred so an enter on the next item can cancel it (event order is not guaranteed)
    window.clearTimeout(hoverClearTimer.current);
    hoverClearTimer.current = window.setTimeout(() => setHovered(null), 0);
  }, []);

  // ---- mouse drag handlers ----
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    didDrag.current = false;
    setGrabbing(true);
    dragStartX.current = e.clientX;
    dragStartOffset.current = offsetRef.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) didDrag.current = true;
    offsetRef.current = dragStartOffset.current + dx;
    applyTransform();
  }, [applyTransform]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setGrabbing(false);
    // Normalize offset to prevent huge values after user drags far
    if (stripRef.current) {
      const oneSetWidth = stripRef.current.scrollWidth / COPY_COUNT;
      if (oneSetWidth > 0) {
        offsetRef.current = ((offsetRef.current % oneSetWidth) + oneSetWidth) % oneSetWidth - oneSetWidth;
      }
    }
    lastTimeRef.current = 0; // reset so dt starts fresh
  }, []);

  // ---- item click: open the 360 drawer (unless it was a drag) ----
  const handleItemClick = useCallback((item: TickerTapeItem) => {
    if (didDrag.current) return;
    openTickerDrawer(item.ticker, {
      symbol: item.ticker,
      price: item.price,
      local: item.price,
      rsi: item.rsi
    });
  }, [openTickerDrawer]);

  // ---- render items ----
  const renderItems = (keyPrefix: string) => {
    if (loading) {
      return (
        <div className="flex gap-12 pr-12 text-muted-foreground text-xs font-mono">
          <span>Actualizando cotizaciones...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div role="alert" className="flex gap-12 pr-12 text-negative text-xs font-mono">
          <span>ERROR AL COTIZAR · REINTENTANDO...</span>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex gap-12 pr-12 text-muted-foreground text-xs font-mono">
          <span>SIN ACTIVOS SOBREVENDIDOS</span>
        </div>
      );
    }

    return (
      <div className="flex gap-12 pr-12">
        {items.map((item) => {
          const isAnchored = hovered?.item.ticker === item.ticker;
          return (
            <button
              key={`${keyPrefix}-${item.ticker}`}
              type="button"
              className="flex items-center gap-3 text-xs font-mono cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              onPointerEnter={handleItemEnter(item)}
              onPointerLeave={handleItemLeave}
              onFocus={handleItemFocus(item)}
              onBlur={handleItemLeave}
              onClick={() => handleItemClick(item)}
              aria-label={`${item.ticker}, precio ${fmtPrice(item.price)} ${item.currency}, RSI ${item.rsi.toFixed(1)} sobrevendido${item.portfolios.length ? `, carteras ${item.portfolios.join(', ')}` : ''}. Abrir ficha del ticker.`}
              aria-describedby={isAnchored ? TOOLTIP_ID : undefined}
            >
              <span className="font-bold text-negative">↓ {item.ticker}</span>
              <span className="text-foreground">
                ${fmtPrice(item.price)}
                <span className="ml-1 text-muted-foreground">{item.currency}</span>
              </span>
              {item.portfolios.length > 0 && (
                <span className="text-positive">
                  [{item.portfolios.join(', ')}]
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ---- tooltip: portaled to body so the strip's overflow-hidden can't clip it ----
  const tooltip = hovered
    ? createPortal(
        <div
          id={TOOLTIP_ID}
          role="tooltip"
          className="fixed z-[100] pointer-events-none px-3 py-2 rounded-md bg-foreground text-background shadow-xl text-xs font-mono whitespace-nowrap border border-border"
          style={{
            left: hovered.x,
            top: hovered.placeBelow ? hovered.y + 24 : hovered.y - 10,
            transform: hovered.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">{hovered.item.ticker}</span>
            <span className="opacity-70">RSI:</span>
            <span className="font-bold text-negative">{hovered.item.rsi.toFixed(1)}</span>
            <span className="opacity-80">(Sobrevendido)</span>
          </div>
          <div className="opacity-80 mt-0.5">
            Precio: ${fmtPrice(hovered.item.price)} {hovered.item.currency}
          </div>
          {hovered.item.portfolios.length > 0 && (
            <div className="opacity-80">
              Carteras: {hovered.item.portfolios.join(', ')}
            </div>
          )}
          <div className="opacity-50 mt-1 text-[9px] uppercase tracking-wider">Click o Enter → ficha del ticker</div>
          <div
            className={cn(
              'absolute left-1/2 -translate-x-1/2 border-4 border-transparent',
              hovered.placeBelow ? 'bottom-full border-b-foreground' : 'top-full border-t-foreground'
            )}
          />
        </div>,
        document.body
      )
    : null;

  return (
    <div
      className={cn(
        'h-7 bg-card border-t border-border flex items-center whitespace-nowrap shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 overflow-hidden select-none',
        grabbing ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={handleBarPointerEnter}
      onPointerLeave={handleBarPointerLeave}
      onFocusCapture={handleBarFocusCapture}
      onBlurCapture={handleBarBlurCapture}
    >
      <div className="flex items-center bg-secondary px-4 h-full border-r border-border z-20 shadow-xl shrink-0 pointer-events-none">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-negative animate-pulse"></span>
          RSI &lt;= 35
        </span>
      </div>

      <div
        ref={stripRef}
        className="flex z-10 will-change-transform"
      >
        {renderItems('1')}
        {!loading && !error && items.length > 0 && (
          Array.from({ length: COPY_COUNT - 1 }, (_, i) => (
            <React.Fragment key={`tape-copy-${i + 2}`}>{renderItems(String(i + 2))}</React.Fragment>
          ))
        )}
      </div>

      {tooltip}
    </div>
  );
}
