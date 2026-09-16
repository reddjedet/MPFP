import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Ticker360InitialData {
  symbol?: string;
  ticker?: string;
  company_name?: string;
  sector_name?: string;
  is_etf?: boolean;
  adr?: number | null;
  local?: number | null;
  price?: number | null;
  ratio?: number | string;
  rsi?: number | null;
  earnings_badge?: any;
  gf_value?: number | null;
  gf_signal?: any;
  discount_pct?: number | null;
  ppc?: number | null;
  ppc_return?: any;
  pfcf?: number | null;
  pfcf_signal?: any;
  nominals?: number;
  qty?: number;
  real_nominals?: number;
  value?: number;
  position_value_ars?: number;
  [key: string]: any;
}

interface Ticker360ContextType {
  isOpen: boolean;
  ticker: string | null;
  initialData: Ticker360InitialData | null;
  openTicker360: (ticker: string, initialData?: Ticker360InitialData | null) => void;
  closeTicker360: () => void;
}

const Ticker360Context = createContext<Ticker360ContextType | undefined>(undefined);

export const Ticker360Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Ticker360InitialData | null>(null);

  const openTicker360 = useCallback((newTicker: string, data?: Ticker360InitialData | null) => {
    if (!newTicker) return;
    setTicker(newTicker.trim().toUpperCase());
    setInitialData(data || null);
    setIsOpen(true);
  }, []);

  const closeTicker360 = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <Ticker360Context.Provider value={{ isOpen, ticker, initialData, openTicker360, closeTicker360 }}>
      {children}
    </Ticker360Context.Provider>
  );
};

export const useTicker360 = (): Ticker360ContextType => {
  const context = useContext(Ticker360Context);
  if (!context) {
    throw new Error('useTicker360 must be used within a Ticker360Provider');
  }
  return context;
};
