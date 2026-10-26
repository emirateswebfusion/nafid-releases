import { TrendingUp, Package, Users, DollarSign } from 'lucide-react';

/** AI assistant: chat message / conversation shapes, storage keys and the starter cards (English / Malayalam). */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: unknown;
  chartData?: {
    title?: string;
    labelKey: string;
    dataKey: string;
    items: Array<Record<string, unknown>>;
  };
  suggestedPrompts?: string[];
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

export function humanizeKey(key: string): string {
  if (!key) return '';
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAiConversationsStorageKey(tenantId: string | null | undefined, userId: string | null | undefined): string {
  const t = (tenantId || 'global').trim();
  const u = (userId || 'user').trim();
  return `nafid_ai_convs_${t}_${u}`;
}

export function getAiActiveConvIdStorageKey(tenantId: string | null | undefined, userId: string | null | undefined): string {
  const t = (tenantId || 'global').trim();
  const u = (userId || 'user').trim();
  return `nafid_ai_active_conv_${t}_${u}`;
}

// 100% Genuine Nafid Business Intelligence System Queries
export const BENTO_CARDS_EN = [
  {
    icon: TrendingUp,
    title: "Today's Sales & Bills",
    description: "View total revenue, invoices count, and average bill value today",
    prompt: "What is today's sales and bill count?"
  },
  {
    icon: Package,
    title: "Low Stock Alerts",
    description: "List inventory products that have reached or dropped below reorder level",
    prompt: "Show low stock items below reorder level"
  },
  {
    icon: Users,
    title: "Customer Credit & Debtors",
    description: "Find credit customers with pending balances above ₹5,000",
    prompt: "Which customers have credit balance above ₹5,000?"
  },
  {
    icon: DollarSign,
    title: "Monthly Revenue & Growth",
    description: "Calculate this month's total sales turnover and compare with last month",
    prompt: "What is this month's total sales revenue?"
  }
];

export const BENTO_CARDS_ML = [
  {
    icon: TrendingUp,
    title: "ഇന്നത്തെ സെയിൽസ് & ബില്ലുകൾ",
    description: "ഇന്നത്തെ ആകെ സെയിൽസ് തുകയും ബില്ലുകളുടെ എണ്ണവും പരിശോധിക്കുക",
    prompt: "ഇന്നത്തെ മൊത്തം സെയിൽസ് എത്രയാണ്?"
  },
  {
    icon: Package,
    title: "സ്റ്റോക്ക് മുന്നറിയിപ്പ്",
    description: "റീ-ഓർഡർ ലെവലിൽ എത്തിയതും തീരാറായതുമായ ഉൽപ്പന്നങ്ങൾ കാണിക്കുക",
    prompt: "സ്റ്റോക്ക് തീരാറായ ഉൽപ്പന്നങ്ങൾ കാണിക്കുക"
  },
  {
    icon: Users,
    title: "കസ്റ്റമർ കുടിശ്ശിക (കടം)",
    description: "₹5,000-ൽ കൂടുതൽ ബാക്കി കടമുള്ള കസ്റ്റമേഴ്സിന്റെ വിവരങ്ങൾ",
    prompt: "₹5,000-ൽ കൂടുതൽ കടം ബാക്കിയുള്ള കസ്റ്റമേഴ്സ് ആരെല്ലാം?"
  },
  {
    icon: DollarSign,
    title: "പ്രതിമാസ സെയിൽസ് വിവരങ്ങൾ",
    description: "ഈ മാസത്തെ മൊത്തം സെയിൽസ് വരുമാനം ഒറ്റനോട്ടത്തിൽ അറിയുക",
    prompt: "ഈ മാസത്തെ ആകെ സെയിൽസ് വിവരങ്ങൾ കാണിക്കുക"
  }
];
