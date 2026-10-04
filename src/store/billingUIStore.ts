import { create } from 'zustand';

export type POSLayoutModel = 
  | 'classic-split'       // Classic 2-Column: Cart Left (58%), Payment Right (42%)
  | 'reverse-split'       // Reversed 2-Column: Payment Left (42%), Cart Right (58%)
  | 'horizontal-stack'    // Top/Bottom: Cart Top (65%), Payment Console Bottom (35%)
  | 'supermarket-3col'    // 3-Column Express: Quick Grid (22%), Cart (48%), Payment (30%)
  | 'focus-wide-cart'     // Wide Cart (70%), Slim Payment Sidebar (30%)
  | 'erp-grid-b2c';       // Modern ERP Full-Table B2C Grid (Acro / Tally Desktop Model)

export type QuickPageKey =
  | 'ledger'
  | 'customers'
  | 'inventory'
  | 'purchase_bills'
  | 'financial_report'
  | 'stock_report'
  | 'staff'
  | 'combo_offers'
  | 'warranties';

export interface QuickPageDef {
  key: QuickPageKey;
  label: string;
  eventName: string;
  featureKey?: string;
  desc: string;
}

export const QUICK_PAGES_LIST: QuickPageDef[] = [
  { key: 'ledger', label: 'Ledger (Parties)', eventName: 'open-parties-manager', featureKey: 'parties', desc: 'Credit ledger, party balances & payments' },
  { key: 'customers', label: 'Customers', eventName: 'open-customers-page', featureKey: 'customers', desc: 'Customer list, loyalty points & purchase history' },
  { key: 'inventory', label: 'Inventory', eventName: 'open-inventory-manager', featureKey: 'inventory', desc: 'Manage products, stock levels & prices' },
  { key: 'purchase_bills', label: 'Purchase Bills', eventName: 'open-purchase-bills', featureKey: 'purchase_bills', desc: 'Record & manage GST purchase bills' },
  { key: 'financial_report', label: 'Financial Report', eventName: 'open-financial-report', desc: 'Financial profit/loss & tax summaries' },
  { key: 'stock_report', label: 'Stock Report', eventName: 'open-stock-report', featureKey: 'stock_report', desc: 'View and print detailed stock reports' },
  { key: 'staff', label: 'Staff Directory', eventName: 'open-staff-manager', featureKey: 'staff', desc: 'Staff directory, salary & attendance' },
  { key: 'combo_offers', label: 'Combo Offers', eventName: 'open-combo-manager', featureKey: 'combo_offers', desc: 'Manage product bundles and combo offers' },
  { key: 'warranties', label: 'Warranties', eventName: 'open-warranty-manager', featureKey: 'warranties', desc: 'Warranty certificates & register' },
];

export const INTERNAL_HEADER_BUTTON_CAPACITY = 12;

export interface HeaderButtonConfig {
  showClearCart?: boolean;
  showHistory?: boolean;
  showHeldBills?: boolean;
  showTransport?: boolean;
  showScrap?: boolean;
  showQuotation?: boolean;
  showReturn?: boolean;
  showRegister?: boolean;
}

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

  // Header Button Visibility Toggles
  headerButtons?: HeaderButtonConfig;

  // Quick Page Entry Shortcuts
  quickPageShortcuts?: QuickPageKey[];
  maxTotalHeaderButtons?: number;

  // Cart & Tab Navigation Persistence (2 Separate Controls)
  preserveCartOnHeaderNavigation?: boolean;
  preserveCartOnPageExit?: boolean;
  preserveCartOnNavigation?: boolean; // Legacy fallback
}

const STORAGE_KEY = 'vendora-billing-ui-config';

export const DEFAULT_HEADER_BUTTON_CONFIG: Required<HeaderButtonConfig> = {
  showClearCart: false,
  showHistory: true,
  showHeldBills: true,
  showTransport: false,
  showScrap: true,
  showQuotation: false,
  showReturn: false,
  showRegister: false,
};

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
  headerButtons: DEFAULT_HEADER_BUTTON_CONFIG,
  quickPageShortcuts: ['ledger' as QuickPageKey],
  maxTotalHeaderButtons: INTERNAL_HEADER_BUTTON_CAPACITY,
  preserveCartOnHeaderNavigation: true,
  preserveCartOnPageExit: true,
  preserveCartOnNavigation: true,
};

export function isHeaderButtonVisible(config: BillingUIConfig, buttonKey: keyof HeaderButtonConfig): boolean {
  if (config.showQuickActions === false) return false;
  const hb = config.headerButtons || DEFAULT_HEADER_BUTTON_CONFIG;
  return hb[buttonKey] === true;
}

export function getTotalSelectedHeaderButtonsCount(config: BillingUIConfig): number {
  let count = 0;
  const hb = config.headerButtons || DEFAULT_HEADER_BUTTON_CONFIG;
  const modeKeys: (keyof HeaderButtonConfig)[] = [
    'showClearCart', 'showHistory', 'showHeldBills', 'showTransport',
    'showScrap', 'showQuotation', 'showReturn', 'showRegister'
  ];
  for (const k of modeKeys) {
    if (hb[k] === true) count++;
  }

  const pages = config.quickPageShortcuts || ['ledger'];
  count += pages.length;
  return count;
}

export function sanitizeBillingUIConfig(config: BillingUIConfig): BillingUIConfig {
  const maxCap = INTERNAL_HEADER_BUTTON_CAPACITY;

  const hb: HeaderButtonConfig = {
    ...DEFAULT_HEADER_BUTTON_CONFIG,
    ...(config.headerButtons || {}),
  };

  const rawShortcuts = Array.isArray(config.quickPageShortcuts)
    ? config.quickPageShortcuts
    : (DEFAULT_BILLING_UI_CONFIG.quickPageShortcuts || ['ledger' as QuickPageKey]);

  const activeShortcuts: QuickPageKey[] = [];
  for (const s of rawShortcuts) {
    if (!activeShortcuts.includes(s)) {
      activeShortcuts.push(s);
    }
  }

  const modePriority: (keyof HeaderButtonConfig)[] = [
    'showHistory', 'showHeldBills', 'showScrap', 'showRegister',
    'showQuotation', 'showReturn', 'showTransport', 'showClearCart'
  ];

  const activeModes: (keyof HeaderButtonConfig)[] = [];
  for (const m of modePriority) {
    if (hb[m] === true) {
      activeModes.push(m);
    }
  }

  const totalSelected = activeShortcuts.length + activeModes.length;

  if (totalSelected <= maxCap) {
    return {
      ...config,
      preserveCartOnHeaderNavigation: config.preserveCartOnHeaderNavigation ?? config.preserveCartOnNavigation ?? true,
      preserveCartOnPageExit: config.preserveCartOnPageExit ?? config.preserveCartOnNavigation ?? true,
      preserveCartOnNavigation: config.preserveCartOnNavigation ?? true,
      headerButtons: hb,
      quickPageShortcuts: activeShortcuts,
      maxTotalHeaderButtons: maxCap,
    };
  }

  const keptShortcuts: QuickPageKey[] = [];
  const keptModes: (keyof HeaderButtonConfig)[] = [];
  let remainingSlots = maxCap;

  for (const s of activeShortcuts) {
    if (remainingSlots > 0) {
      keptShortcuts.push(s);
      remainingSlots--;
    }
  }

  for (const m of activeModes) {
    if (remainingSlots > 0) {
      keptModes.push(m);
      remainingSlots--;
    }
  }

  const sanitizedHB: Required<HeaderButtonConfig> = {
    showClearCart: keptModes.includes('showClearCart'),
    showHistory: keptModes.includes('showHistory'),
    showHeldBills: keptModes.includes('showHeldBills'),
    showTransport: keptModes.includes('showTransport'),
    showScrap: keptModes.includes('showScrap'),
    showQuotation: keptModes.includes('showQuotation'),
    showReturn: keptModes.includes('showReturn'),
    showRegister: keptModes.includes('showRegister'),
  };

  return {
    ...config,
    preserveCartOnHeaderNavigation: config.preserveCartOnHeaderNavigation ?? config.preserveCartOnNavigation ?? true,
    preserveCartOnPageExit: config.preserveCartOnPageExit ?? config.preserveCartOnNavigation ?? true,
    preserveCartOnNavigation: config.preserveCartOnNavigation ?? true,
    headerButtons: sanitizedHB,
    quickPageShortcuts: keptShortcuts,
    maxTotalHeaderButtons: maxCap,
  };
}

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
      const merged: BillingUIConfig = {
        ...DEFAULT_BILLING_UI_CONFIG,
        ...parsed,
        preserveCartOnHeaderNavigation: parsed.preserveCartOnHeaderNavigation ?? parsed.preserveCartOnNavigation ?? DEFAULT_BILLING_UI_CONFIG.preserveCartOnHeaderNavigation,
        preserveCartOnPageExit: parsed.preserveCartOnPageExit ?? parsed.preserveCartOnNavigation ?? DEFAULT_BILLING_UI_CONFIG.preserveCartOnPageExit,
        preserveCartOnNavigation: parsed.preserveCartOnNavigation ?? DEFAULT_BILLING_UI_CONFIG.preserveCartOnNavigation,
        headerButtons: {
          ...DEFAULT_HEADER_BUTTON_CONFIG,
          ...(parsed.headerButtons || {}),
        },
        quickPageShortcuts: (Array.isArray(parsed.quickPageShortcuts)
          ? parsed.quickPageShortcuts
          : DEFAULT_BILLING_UI_CONFIG.quickPageShortcuts) as QuickPageKey[],
        maxTotalHeaderButtons: INTERNAL_HEADER_BUTTON_CAPACITY,
      };
      return sanitizeBillingUIConfig(merged);
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
    const rawShortcuts = partial.quickPageShortcuts !== undefined
      ? partial.quickPageShortcuts
      : (current.quickPageShortcuts || DEFAULT_BILLING_UI_CONFIG.quickPageShortcuts || []);

    const merged: BillingUIConfig = {
      ...current,
      ...partial,
      headerButtons: {
        ...(current.headerButtons || DEFAULT_HEADER_BUTTON_CONFIG),
        ...(partial.headerButtons || {}),
      },
      quickPageShortcuts: (Array.isArray(rawShortcuts) ? rawShortcuts : (['ledger'] as QuickPageKey[])) as QuickPageKey[],
      maxTotalHeaderButtons: INTERNAL_HEADER_BUTTON_CAPACITY,
    };
    const updated = sanitizeBillingUIConfig(merged);
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
