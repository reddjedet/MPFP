import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  earnings_badge?: string | number | null;
  gf_value?: number | null;
  gf_signal?: string | null;
  discount_pct?: number | null;
  ppc?: number | null;
  ppc_return?: string | number | null;
  pfcf?: number | null;
  pfcf_signal?: string | null;
  nominals?: number;
  qty?: number;
  real_nominals?: number;
  value?: number;
  position_value_ars?: number;
  [key: string]: unknown;
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

  // Global Portfolio Selection
  selectedPf: string;
  setSelectedPf: (pf: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentArea: 'hub',
      currentSubTab: '',
      rememberLastView: true,

      isCommandPaletteOpen: false,
      isBuyerModeOpen: false,
      isSellerModeOpen: false,
      isTicker360Open: false,
      selectedTicker: null,
      ticker360InitialData: null,

      setArea: (area, defaultSubTab = '') => set({ currentArea: area, currentSubTab: defaultSubTab }),
      setSubTab: (subTab) => set({ currentSubTab: subTab }),
      goHome: () => set({ currentArea: 'hub' }),
      setRememberLastView: (val) => set({ rememberLastView: val }),

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

      selectedPf: 'bmb',
      setSelectedPf: (pf) => set({ selectedPf: pf }),
    }),
    {
      name: 'finapp_storage',
      partialize: (state) => ({
        // Only persist these keys
        rememberLastView: state.rememberLastView,
        selectedPf: state.selectedPf,
        ...(state.rememberLastView && {
          currentArea: state.currentArea,
          currentSubTab: state.currentSubTab,
        }),
      }),
    }
  )
);
