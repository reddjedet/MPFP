import React from 'react';

const OVERSOLD_TICKERS = [
  { ticker: 'TSLA', price: 15400.50, sector: 'Consumo', portfolios: ['Cartera 1', 'Cartera 2'], rsi: 28 },
  { ticker: 'PFE', price: 8200.00, sector: 'Salud', portfolios: ['Cartera 3'], rsi: 32 },
  { ticker: 'DIS', price: 9500.25, sector: 'Comunicación', portfolios: [], rsi: 25 },
  { ticker: 'NKE', price: 11200.10, sector: 'Consumo', portfolios: ['Cartera 2'], rsi: 34 },
  { ticker: 'BABA', price: 18500.00, sector: 'Comercio', portfolios: ['Cartera 1'], rsi: 18 },
  { ticker: 'MCD', price: 21500.75, sector: 'Consumo', portfolios: ['Cartera 3'], rsi: 31 },
];

export function TickerTape() {
  const renderItems = (keyPrefix: string) => (
    <div className="flex gap-12 pr-12">
      {OVERSOLD_TICKERS.map((item) => (
        <div key={`${keyPrefix}-${item.ticker}`} className="group relative flex items-center gap-3 text-xs font-mono cursor-pointer">
          <span className="font-bold text-negative">↓ {item.ticker}</span>
          <span className="text-foreground">${item.price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
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

  return (
    <div className="h-7 bg-card border-t border-border flex items-center whitespace-nowrap shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
      <div className="flex items-center bg-secondary px-4 h-full border-r border-border z-20 shadow-xl shrink-0">
        <span className="text-[10px] font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-negative animate-pulse"></span>
          RSI &lt; 35
        </span>
      </div>
      
      <div className="flex animate-ticker hover:[animation-play-state:paused] z-10">
        {renderItems('1')}
        {renderItems('2')}
        {renderItems('3')}
      </div>
    </div>
  );
}
