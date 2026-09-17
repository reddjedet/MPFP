import { create } from 'zustand';

export type WorkspaceArea = 'hub' | 'portfolios' | 'renta_variable' | 'renta_fija' | 'markowitz';

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

interface AppState {
  // Navigation
  currentArea: WorkspaceArea;
  currentSubTab: string;
  rememberLastView: boolean;

  // Modals & Drawers
  isCommandPaletteOpen: boolean;
  isBuyerModeOpen: boolean;
  isSellerModeOpen: boolean;

  // Ticker360 Drawer
  isTicker360Open: boolean;
  selectedTicker: string | null;
  ticker360InitialData: Ticker360InitialData | null;

  // Navigation Actions
  setArea: (area: WorkspaceArea, defaultSubTab?: string) => void;
  setSubTab: (subTab: string) => void;
  goHome: () => void;
  setRememberLastView: (val: boolean) => void;

  // Modal Actions
  toggleCommandPalette: () => void;
  toggleBuyerMode: () => void;
  toggleSellerMode: () => void;

  // Ticker360 Actions
  openTickerDrawer: (ticker: string, initialData?: Ticker360InitialData | null) => void;
  closeTickerDrawer: () => void;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    if (typeof fallback === 'boolean') return (val === 'true') as T;
    return val as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(e);
  }
}

const rememberInit = loadFromStorage('finapp_remember_view', true);

export const useAppStore = create<AppState>((set) => ({
  currentArea: (() => {
    if (rememberInit) {
      const saved = loadFromStorage<string>('finapp_last_area', 'hub');
      if (['portfolios', 'renta_variable', 'renta_fija', 'markowitz'].includes(saved)) {
        return saved as WorkspaceArea;
      }
    }
    return 'hub' as WorkspaceArea;
  })(),

  currentSubTab: (() => {
    if (rememberInit) {
      return loadFromStorage<string>('finapp_last_subtab', '');
    }
    return '';
  })(),

  rememberLastView: rememberInit,
  isCommandPaletteOpen: false,
  isBuyerModeOpen: false,
  isSellerModeOpen: false,
  isTicker360Open: false,
  selectedTicker: null,
  ticker360InitialData: null,

  setArea: (area, defaultSubTab = '') => {
    set({ currentArea: area, currentSubTab: defaultSubTab });
    saveToStorage('finapp_last_area', area);
    saveToStorage('finapp_last_subtab', defaultSubTab);
  },

  setSubTab: (subTab) => {
    set({ currentSubTab: subTab });
    saveToStorage('finapp_last_subtab', subTab);
  },

  goHome: () => {
    set({ currentArea: 'hub' });
  },

  setRememberLastView: (val) => {
    set({ rememberLastView: val });
    saveToStorage('finapp_remember_view', String(val));
    if (!val) {
      try {
        localStorage.removeItem('finapp_last_area');
      } catch (e) {
        console.error(e);
      }
    }
  },

  toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  toggleBuyerMode: () => set((s) => ({ isBuyerModeOpen: !s.isBuyerModeOpen, isSellerModeOpen: false })),
  toggleSellerMode: () => set((s) => ({ isSellerModeOpen: !s.isSellerModeOpen, isBuyerModeOpen: false })),

  openTickerDrawer: (ticker, initialData = null) => {
    if (!ticker) return;
    set({
      isTicker360Open: true,
      selectedTicker: ticker.trim().toUpperCase(),
      ticker360InitialData: initialData || null,
    });
  },

  closeTickerDrawer: () => set({ isTicker360Open: false }),
}));
