import React, { useEffect, useState } from 'react';

interface TickerTapeItem {
  ticker: string;
  price: number;
  rsi: number;
  portfolios: string[];
}

export function TickerTape() {
  const [oversoldTickers, setOversoldTickers] = useState<TickerTapeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const [quotesRes, pfRes] = await Promise.all([
          fetch('/api/cedears/quotes_json'),
          fetch('/api/portfolios/list_json')
        ]);
        
        if (!quotesRes.ok || !pfRes.ok) return;

        const quotesData = await quotesRes.json();
        const pfData = await pfRes.json();
        
        if (!isMounted) return;

        const portfolios = pfData.portfolios || {};
        const portfolioMap: Record<string, string[]> = {};
        
        // Build map of ticker -> portfolio names
        for (const [pfName, pfObj] of Object.entries(portfolios)) {
          const assets = (pfObj as any).assets || {};
          for (const tk of Object.keys(assets)) {
            if (!portfolioMap[tk]) portfolioMap[tk] = [];
            portfolioMap[tk].push(pfName);
          }
        }

        const quotes = quotesData.quotes || [];
        const oversold = quotes
          .filter((q: any) => q.rsi !== null && q.rsi <= 35)
          .map((q: any) => ({
            ticker: q.symbol,
            price: q.local || q.cedear_usd || 0,
            rsi: q.rsi,
            portfolios: portfolioMap[q.symbol] || []
          }))
          .sort((a: any, b: any) => a.rsi - b.rsi); // sort by lowest RSI first
        
        setOversoldTickers(oversold);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching TickerTape data", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every minute
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const renderItems = (keyPrefix: string) => {
    if (loading) {
      return (
        <div className="flex gap-12 pr-12 text-muted-foreground text-xs font-mono">
          <span>Actualizando cotizaciones...</span>
        </div>
      );
    }
    
    if (oversoldTickers.length === 0) {
      return (
        <div className="flex gap-12 pr-12 text-muted-foreground text-xs font-mono">
          <span>SIN ACTIVOS SOBREVENDIDOS</span>
        </div>
      );
    }

    return (
      <div className="flex gap-12 pr-12">
        {oversoldTickers.map((item) => (
          <div key={`${keyPrefix}-${item.ticker}`} className="group relative flex items-center gap-3 text-xs font-mono cursor-pointer">
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
    <div className="h-7 bg-card border-t border-border flex items-center whitespace-nowrap shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
      <div className="flex items-center bg-secondary px-4 h-full border-r border-border z-20 shadow-xl shrink-0">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-negative animate-pulse"></span>
          RSI &lt;= 35
        </span>
      </div>
      
      <div className="flex animate-ticker hover:[animation-play-state:paused] z-10">
        {renderItems('1')}
        {/* Only repeat if we have items to animate smoothly */}
        {!loading && oversoldTickers.length > 0 && (
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
