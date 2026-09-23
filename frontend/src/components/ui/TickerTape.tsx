import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useCachedQuery } from '@/lib/queryCache';

interface TickerTapeItem {
  ticker: string;
  price: number;
  rsi: number;
  portfolios: string[];
}

/** Speed in px/s for the auto-scroll */
const SCROLL_SPEED = 50;

/** Fetcher: loads quotes + portfolio list, filters oversold, builds portfolio map */
async function fetchTickerTapeData(): Promise<TickerTapeItem[]> {
  const [quotesRes, pfRes] = await Promise.all([
    fetch('/api/cedears/quotes_json'),
    fetch('/api/portfolios/list_json')
  ]);

  if (!quotesRes.ok || !pfRes.ok) return [];

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
      rsi: q.rsi,
      portfolios: portfolioMap[q.symbol] || []
    }))
    .sort((a: any, b: any) => a.rsi - b.rsi);
}

export function TickerTape() {
  const { data: oversoldTickers, loading } = useCachedQuery<TickerTapeItem[]>(
    'ticker-tape-oversold',
    fetchTickerTapeData,
    { ttl: 60, refetchInterval: 60 }
  );
  const [grabbing, setGrabbing] = useState(false);

  // --- drag + animation refs ---
  const stripRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);          // current translateX offset (px, negative = scrolled left)
  const rafRef = useRef<number>(0);     // requestAnimationFrame id
  const lastTimeRef = useRef<number>(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  const items = oversoldTickers ?? [];

  // ---- rAF auto-scroll loop ----
  const applyTransform = useCallback(() => {
    if (stripRef.current) {
      stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
    }
  }, []);

  const tick = useCallback((time: number) => {
    if (isDragging.current) {
      // While dragging, skip auto-advance but keep the loop alive
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    if (lastTimeRef.current === 0) lastTimeRef.current = time;
    const dt = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;

    offsetRef.current -= SCROLL_SPEED * dt;

    // Wrap: when we've scrolled past 1/6 of the strip (6 copies), reset to avoid float drift
    if (stripRef.current) {
      const oneSetWidth = stripRef.current.scrollWidth / 6;
      if (oneSetWidth > 0 && Math.abs(offsetRef.current) >= oneSetWidth) {
        offsetRef.current += oneSetWidth;
      }
    }

    applyTransform();
    rafRef.current = requestAnimationFrame(tick);
  }, [applyTransform]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // ---- mouse drag handlers ----
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setGrabbing(true);
    dragStartX.current = e.clientX;
    dragStartOffset.current = offsetRef.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    offsetRef.current = dragStartOffset.current + dx;
    applyTransform();
  }, [applyTransform]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setGrabbing(false);
    // Normalize offset to prevent huge values after user drags far
    if (stripRef.current) {
      const oneSetWidth = stripRef.current.scrollWidth / 6;
      if (oneSetWidth > 0) {
        offsetRef.current = ((offsetRef.current % oneSetWidth) + oneSetWidth) % oneSetWidth - oneSetWidth;
      }
    }
    lastTimeRef.current = 0; // reset so dt starts fresh
  }, []);

  // ---- render items (unchanged) ----
  const renderItems = (keyPrefix: string) => {
    if (loading) {
      return (
        <div className="flex gap-12 pr-12 text-muted-foreground text-xs font-mono">
          <span>Actualizando cotizaciones...</span>
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
        {items.map((item) => (
          <div key={`${keyPrefix}-${item.ticker}`} className="group relative flex items-center gap-3 text-xs font-mono">
            <span className="font-bold text-negative">↓ {item.ticker}</span>
            <span className="text-foreground">${item.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {item.portfolios.length > 0 && (
              <span className="text-positive">
                [{item.portfolios.join(', ')}]
              </span>
            )}

            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground text-background shadow-lg z-50 whitespace-nowrap">
              <span>RSI:</span>
              <span className="font-bold text-negative">{item.rsi}</span>
              <span className="text-xs opacity-80">(Sobrevendido)</span>
              
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground"></div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="h-7 bg-card border-t border-border flex items-center whitespace-nowrap shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 overflow-hidden select-none"
      style={{ cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
        {!loading && items.length > 0 && (
          <>
            {renderItems('2')}
            {renderItems('3')}
            {renderItems('4')}
            {renderItems('5')}
            {renderItems('6')}
          </>
        )}
      </div>
    </div>
  );
}
