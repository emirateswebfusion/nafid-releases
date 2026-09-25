import { create } from 'zustand';

export type POSLayoutModel = 
  | 'classic-split'       // Classic 2-Column: Cart Left (58%), Payment Right (42%)
  | 'reverse-split'       // Reversed 2-Column: Payment Left (42%), Cart Right (58%)
  | 'horizontal-stack'    // Top/Bottom: Cart Top (65%), Payment Console Bottom (35%)
  | 'supermarket-3col'    // 3-Column Express: Quick Grid (22%), Cart (48%), Payment (30%)
  | 'focus-wide-cart'     // Wide Cart (70%), Slim Payment Sidebar (30%)
  | 'erp-grid-b2c';       // Modern ERP Full-Table B2C Grid (Acro / Tally Desktop Model)

export interface BillingUIConfig {
  // Primary Layout Model Presets
  layoutModel: POSLayoutModel;

  // Structural Properties
  layoutPosition: 'cart-left' | 'cart-right';
  splitRatio: '50-50' | '58-42' | '65-35' | '70-30';
  orientation: 'vertical-split' | 'horizontal-stack' | 'three-column';
  
  searchBarPosition: 'top' | 'cart-header';
  customerInfoPosition: 'top-cart' | 'above-payment';
  entryFocusOrder?: 'search-first' | 'customer-first';

  // Density & Touch Sizing
  density: 'compact' | 'normal' | 'touch-large';
  touchMode: boolean;

  // Visibility Toggles
  showQuickActions: boolean;
  showScaleButton: boolean;
  showQuickCategoryBar: boolean;
  showPurchasePriceInPOS?: boolean;
}

const STORAGE_KEY = 'vendora-billing-ui-config';

export const DEFAULT_BILLING_UI_CONFIG: BillingUIConfig = {
  layoutModel: 'classic-split',
  layoutPosition: 'cart-left',
  splitRatio: '58-42',
  orientation: 'vertical-split',
  searchBarPosition: 'top',
  customerInfoPosition: 'top-cart',
  entryFocusOrder: 'search-first',
  density: 'normal',
  touchMode: false,
  showQuickActions: true,
  showScaleButton: true,
  showQuickCategoryBar: false,
  showPurchasePriceInPOS: false,
};

export const POS_LAYOUT_MODELS_DATA: Record<POSLayoutModel, {
  id: POSLayoutModel;
  name: string;
  subtitle: string;
  description: string;
  config: Partial<BillingUIConfig>;
}> = {
  'classic-split': {
    id: 'classic-split',
    name: 'Classic Retail Split',
    subtitle: 'Cart Left (58%) &bull; Payment Right (42%)',
    description: 'Traditional 2-column supermarket layout. Search and line item table on the left, payment methods and total on the right.',
    config: {
      layoutModel: 'classic-split',
      layoutPosition: 'cart-left',
      splitRatio: '58-42',
      orientation: 'vertical-split',
      showQuickCategoryBar: false,
    }
  },
  'reverse-split': {
    id: 'reverse-split',
    name: 'Reversed Console',
    subtitle: 'Payment Left (42%) &bull; Cart Right (58%)',
    description: 'Reversed 2-column layout putting payment action buttons on the left. Ideal for left-handed cashiers or side customer terminals.',
    config: {
      layoutModel: 'reverse-split',
      layoutPosition: 'cart-right',
      splitRatio: '58-42',
      orientation: 'vertical-split',
      showQuickCategoryBar: false,
    }
  },
  'horizontal-stack': {
    id: 'horizontal-stack',
    name: 'Top / Bottom Stack',
    subtitle: 'Cart Top (Full Width) &bull; Payment Bar Bottom',
    description: 'Horizontal stack layout. Maximizes item table visibility on wide widescreen monitors with a dedicated bottom payment console.',
    config: {
      layoutModel: 'horizontal-stack',
      layoutPosition: 'cart-left',
      splitRatio: '65-35',
      orientation: 'horizontal-stack',
      showQuickCategoryBar: false,
    }
  },
  'supermarket-3col': {
    id: 'supermarket-3col',
    name: 'Express 3-Column',
    subtitle: 'Most Sold (22%) \u2022 Cart (48%) \u2022 Payment (30%)',
    description: '3-Column layout with most sold products on the far left, cart table in middle, and payment console on right.',
    config: {
      layoutModel: 'supermarket-3col',
      layoutPosition: 'cart-left',
      splitRatio: '58-42',
      orientation: 'three-column',
      showQuickCategoryBar: true,
    }
  },
  'focus-wide-cart': {
    id: 'focus-wide-cart',
    name: 'Wide Cart Focus',
    subtitle: 'Cart (70%) &bull; Compact Payment (30%)',
    description: 'Gives maximum screen space (70%) to item line items, barcode scan lists, and serial numbers, with a slim payment sidebar.',
    config: {
      layoutModel: 'focus-wide-cart',
      layoutPosition: 'cart-left',
      splitRatio: '70-30',
      orientation: 'vertical-split',
      showQuickCategoryBar: false,
    }
  },
  'erp-grid-b2c': {
    id: 'erp-grid-b2c',
    name: 'Modern ERP B2C Grid',
    subtitle: 'Full-Width Grid &bull; ERP Metadata &bull; Live Stock & Footer Totals',
    description: 'Classic enterprise desktop ERP billing interface (Acro / Tally B2C) elevated to modern UI. Full-width item grid with Barcode, SKU, Tax (SGST/CGST/IGST), live item stock indicator, and bottom settlement bar.',
    config: {
      layoutModel: 'erp-grid-b2c',
      layoutPosition: 'cart-left',
      splitRatio: '70-30',
      orientation: 'horizontal-stack',
      showQuickCategoryBar: false,
    }
  }
};

function loadStoredConfig(): BillingUIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_BILLING_UI_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load Billing UI config from localStorage', e);
  }
  return DEFAULT_BILLING_UI_CONFIG;
}

interface BillingUIState {
  config: BillingUIConfig;
  updateConfig: (partial: Partial<BillingUIConfig>) => void;
  resetConfig: () => void;
  setLayoutModel: (modelId: POSLayoutModel) => void;
}

export const useBillingUIStore = create<BillingUIState>((set, get) => ({
  config: loadStoredConfig(),

  updateConfig: (partial) => {
    const current = get().config;
    const updated = { ...current, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save Billing UI config to localStorage', e);
    }
    window.dispatchEvent(new CustomEvent('billing-ui-config-changed', { detail: updated }));
    set({ config: updated });
  },

  resetConfig: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BILLING_UI_CONFIG));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('billing-ui-config-changed', { detail: DEFAULT_BILLING_UI_CONFIG }));
    set({ config: DEFAULT_BILLING_UI_CONFIG });
  },

  setLayoutModel: (modelId) => {
    const modelData = POS_LAYOUT_MODELS_DATA[modelId];
    if (modelData) {
      get().updateConfig(modelData.config);
    }
  }
}));
