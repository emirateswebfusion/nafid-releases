import { create } from 'zustand';
import { hasBridge } from '../data/client';
import { setSetting, settingsApi } from '../data/settings';

export type TerminologyPreset = 'SIMPLE' | 'ACCOUNTING' | 'CASHFLOW' | 'CUSTOM';

export interface TerminologyCustomLabels {
  receivable: string;
  payable: string;
  received: string;
  paid: string;
  credit: string;
  debit: string;
}

export interface TerminologyLabels {
  receivable: string;
  payable: string;
  received: string;
  paid: string;
  credit: string;
  debit: string;
  receivableSub: string;
  payableSub: string;
}

export interface PresetMeta {
  id: TerminologyPreset;
  title: string;
  subtitle: string;
  descriptionMl: string;
  labels: TerminologyLabels;
}

export const TERMINOLOGY_PRESETS: Record<Exclude<TerminologyPreset, 'CUSTOM'>, PresetMeta> = {
  SIMPLE: {
    id: 'SIMPLE',
    title: "Simple Business (Recommended)",
    subtitle: "Ideal for shop owners & everyday usage (You'll Get / You'll Give)",
    descriptionMl: "Clear everyday terms for shop owners and staff (You'll Get / You'll Give).",
    labels: {
      receivable: "You'll Get",
      payable: "You'll Give",
      received: "Shop received from party",
      paid: "Shop paid party",
      credit: "Shop paid / Other additions",
      debit: "Shop received / Other deductions",
      receivableSub: "Amount owed to you",
      payableSub: "Amount you owe",
    },
  },
  ACCOUNTING: {
    id: 'ACCOUNTING',
    title: 'Standard Accounting',
    subtitle: 'Formal accounting terminology (Receivable / Payable)',
    descriptionMl: 'Traditional accounting terms ideal for accountants and professionals.',
    labels: {
      receivable: 'Receivable',
      payable: 'Payable',
      received: 'Shop received from party',
      paid: 'Shop paid party',
      credit: 'Credit',
      debit: 'Debit',
      receivableSub: 'Amount owed to you',
      payableSub: 'Amount you owe',
    },
  },
  CASHFLOW: {
    id: 'CASHFLOW',
    title: 'Cash Flow Mode',
    subtitle: 'Focus on cash movements (Cash In / Cash Out)',
    descriptionMl: 'Helps track incoming and outgoing cash movements quickly.',
    labels: {
      receivable: 'Pending Cash In',
      payable: 'Pending Cash Out',
      received: 'Cash In',
      paid: 'Cash Out',
      credit: 'Shop paid / Other additions',
      debit: 'Shop received / Other deductions',
      receivableSub: 'Upcoming cash inflows',
      payableSub: 'Upcoming cash outflows',
    },
  },
};

export const DEFAULT_CUSTOM_LABELS: TerminologyCustomLabels = {
  receivable: "You'll Get",
  payable: "You'll Give",
  received: "Shop received from party",
  paid: "Shop paid party",
  credit: "Shop paid / Other additions",
  debit: "Shop received / Other deductions",
};

const STORAGE_KEY_PRESET = 'nafid_terminology_preset';
const STORAGE_KEY_CUSTOM = 'nafid_terminology_custom';

function loadStoredPreset(): TerminologyPreset {
  try {
    const val = localStorage.getItem(STORAGE_KEY_PRESET) as TerminologyPreset;
    if (val && ['SIMPLE', 'ACCOUNTING', 'CASHFLOW', 'CUSTOM'].includes(val)) {
      return val;
    }
  } catch { /* ignore */ }
  return 'SIMPLE';
}

function loadStoredCustomLabels(): TerminologyCustomLabels {
  try {
    const val = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (val) {
      const parsed = JSON.parse(val);
      return { ...DEFAULT_CUSTOM_LABELS, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_CUSTOM_LABELS;
}

export function computeLabels(preset: TerminologyPreset, customLabels: TerminologyCustomLabels): TerminologyLabels {
  if (preset === 'CUSTOM') {
    return {
      receivable: customLabels.receivable || DEFAULT_CUSTOM_LABELS.receivable,
      payable: customLabels.payable || DEFAULT_CUSTOM_LABELS.payable,
      received: customLabels.received || DEFAULT_CUSTOM_LABELS.received,
      paid: customLabels.paid || DEFAULT_CUSTOM_LABELS.paid,
      credit: customLabels.credit || DEFAULT_CUSTOM_LABELS.credit,
      debit: customLabels.debit || DEFAULT_CUSTOM_LABELS.debit,
      receivableSub: 'Balance Owed to You',
      payableSub: 'Balance You Owe',
    };
  }
  return TERMINOLOGY_PRESETS[preset]?.labels || TERMINOLOGY_PRESETS.SIMPLE.labels;
}

interface TerminologyState {
  preset: TerminologyPreset;
  customLabels: TerminologyCustomLabels;
  labels: TerminologyLabels;
  setPreset: (preset: TerminologyPreset) => void;
  setCustomLabels: (labels: Partial<TerminologyCustomLabels>) => void;
  getLabels: () => TerminologyLabels;
  t: (key: keyof TerminologyCustomLabels, short?: boolean) => string;
}

const initialPreset = loadStoredPreset();
const initialCustomLabels = loadStoredCustomLabels();

export const useTerminologyStore = create<TerminologyState>((set, get) => ({
  preset: initialPreset,
  customLabels: initialCustomLabels,
  labels: computeLabels(initialPreset, initialCustomLabels),

  setPreset: (preset) => {
    try {
      localStorage.setItem(STORAGE_KEY_PRESET, preset);
    } catch { /* ignore */ }
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: STORAGE_KEY_PRESET, value: preset }).catch(() => {});
    }
    const labels = computeLabels(preset, get().customLabels);
    set({ preset, labels });
  },

  setCustomLabels: (newLabels) => {
    const updated = { ...get().customLabels, ...newLabels };
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(updated));
    } catch { /* ignore */ }
    if (typeof window !== 'undefined' && hasBridge('settingsSet')) {
      settingsApi.set({ tenant_id: 'global', key: STORAGE_KEY_CUSTOM, value: updated }).catch(() => {});
    }
    const labels = computeLabels(get().preset, updated);
    set({ customLabels: updated, labels });
  },

  getLabels: () => {
    return get().labels;
  },

  t: (key, short = false) => {
    const labels = get().labels;
    let val = labels[key] || key;
    if (short && typeof val === 'string' && val.includes('(')) {
      val = val.split('(')[0].trim();
    }
    return val;
  }
}));

async function hydrateTerminologyFromDB() {
  if (typeof window !== 'undefined' && hasBridge('settingsGet')) {
    try {
      const storedPreset = await settingsApi.get({ tenant_id: 'global', key: STORAGE_KEY_PRESET });
      const storedCustom = await settingsApi.get({ tenant_id: 'global', key: STORAGE_KEY_CUSTOM });
      
      let nextPreset = useTerminologyStore.getState().preset;
      let nextCustom = useTerminologyStore.getState().customLabels;

      if (storedPreset && ['SIMPLE', 'ACCOUNTING', 'CASHFLOW', 'CUSTOM'].includes(storedPreset)) {
        nextPreset = storedPreset as TerminologyPreset;
      }
      if (storedCustom && typeof storedCustom === 'object') {
        nextCustom = { ...DEFAULT_CUSTOM_LABELS, ...storedCustom };
      }

      const labels = computeLabels(nextPreset, nextCustom);
      useTerminologyStore.setState({ preset: nextPreset, customLabels: nextCustom, labels });
    } catch (e) {
      console.warn('[terminologyStore] Failed to hydrate terminology from DB:', e);
    }
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    hydrateTerminologyFromDB();
  }, 100);
}


/** Commit Settings drafts before publishing new ledger wording to the running app. */
export async function saveTerminologyPreferences(preset: TerminologyPreset, customLabels: TerminologyCustomLabels) {
  await setSetting({ tenant_id: 'global', key: STORAGE_KEY_PRESET, value: preset });
  await setSetting({ tenant_id: 'global', key: STORAGE_KEY_CUSTOM, value: customLabels });
  localStorage.setItem(STORAGE_KEY_PRESET, preset);
  localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customLabels));
  useTerminologyStore.setState({ preset, customLabels, labels: computeLabels(preset, customLabels) });
}
