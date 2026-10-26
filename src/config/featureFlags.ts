export type FeatureKey =
  | 'billing'
  | 'cash_settlement'
  | 'cash_register'
  | 'inventory'
  | 'combo_offers'
  | 'categories_grades'
  | 'pricing_tiers'
  | 'stock_report'
  | 'quotations'
  | 'purchase_bills'
  | 'warranties'
  | 'returns'
  | 'scrap'
  | 'parties'
  | 'payments'
  | 'customers'
  | 'staff'
  | 'staff_attendance'
  | 'biller_pin'
  | 'sales_staff'
  | 'staff_credit_billing'
  | 'sales_history'
  | 'loyalty'
  | 'ecommerce'
  | 'ai_assistant'
  | 'recycle_bin';

export type FeatureFlags = Record<FeatureKey, boolean>;

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  desc: string;
}

export const isAiAssistantAvailable = true;

export const FEATURE_LIST: FeatureDef[] = [
  { key: 'billing', label: 'Billing', desc: 'Create new invoices and manage sales' },
  { key: 'cash_settlement', label: 'Cash Settlement', desc: 'Settle pending bills, manage cash drawer, and day-end closing' },
  { key: 'cash_register', label: 'Cash Register', desc: 'Quick cash-in / cash-out panel on the billing page' },
  { key: 'inventory', label: 'Inventory Manager', desc: 'Manage products, stock levels, and pricing' },
  { key: 'ecommerce', label: 'E-Commerce Admin & Vendor Portal', desc: 'Manage online products, sync stock, and process FusionCart online orders' },
  { key: 'combo_offers', label: 'Combo Offers', desc: 'Create and manage product bundles and combo offers' },
  { key: 'categories_grades', label: 'Categories & Grades', desc: 'Configure category classifications, grade rules, purchase price, and MRP' },
  { key: 'pricing_tiers', label: 'Pricing Tiers', desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices' },
  { key: 'stock_report', label: 'Stock Report', desc: 'Print A4 stock reports with PDF export' },
  { key: 'quotations', label: 'Quotations', desc: 'Quotation mode on billing and the quotation manager' },
  { key: 'purchase_bills', label: 'Purchase Bills', desc: 'Record and manage GST purchase bills' },
  { key: 'warranties', label: 'Warranty Bills', desc: 'Register and print warranty certificates' },
  { key: 'returns', label: 'Returns', desc: 'Return mode on billing and the returns manager' },
  { key: 'scrap', label: 'Enable Scrap Management', desc: 'Scrap mode, scrap deduction, and scrap manager' },
  { key: 'parties', label: 'Ledger', desc: 'Track credit parties, balances, and payments' },
  { key: 'payments', label: 'Payment Methods', desc: 'Manage bank accounts, cards & UPI ids for receiving payments' },
  { key: 'customers', label: 'Customers', desc: 'Browse customer list, points balances, and purchase history' },
  { key: 'staff', label: 'Staff Management', desc: 'Central employee directory, salary book, advances, and staff ledger' },
  { key: 'staff_attendance', label: 'Enable Staff Attendance', desc: 'Track daily staff attendance, leaves, and working hours' },
  { key: 'biller_pin', label: 'Enable Biller PIN', desc: 'Require 4-digit PIN verification when printing bills for accountability' },
  { key: 'sales_staff', label: 'Enable Customer Handler / Sales Staff', desc: 'Allow selecting customer handler / sales staff on billing for sales attribution' },
  { key: 'staff_credit_billing', label: 'Show Staff in Billing & Ledger', desc: 'Show staff in customer search and record staff credit purchases directly in staff ledger' },
  { key: 'sales_history', label: 'Sales History', desc: 'Review past transactions and reports' },
  { key: 'recycle_bin', label: 'Recycle Bin', desc: 'Restore accidentally deleted bills, inventory items, and customer contacts' },
  { key: 'loyalty', label: 'Loyalty Points', desc: 'Earn and redeem loyalty points on purchases' },
  ...(isAiAssistantAvailable ? [
    { key: 'ai_assistant' as FeatureKey, label: 'AI Business Assistant', desc: 'Smart AI chatbot for sales analytics, stock alerts, credit reports & commands' }
  ] : []),
];

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  billing: true,
  cash_settlement: true,
  cash_register: true,
  inventory: true,
  ecommerce: false,
  combo_offers: true,
  categories_grades: true,
  pricing_tiers: true,
  stock_report: true,
  quotations: true,
  purchase_bills: true,
  warranties: true,
  returns: true,
  scrap: true,
  parties: true,
  payments: true,
  customers: true,
  staff: true,
  staff_attendance: false,
  biller_pin: false,
  sales_staff: false,
  staff_credit_billing: false,
  sales_history: true,
  loyalty: true,
  ai_assistant: isAiAssistantAvailable,
  recycle_bin: true,
};

export function sanitizeFeatureFlags(flags: FeatureFlags): FeatureFlags {
  const sanitized = { ...flags };
  // If Cash Settlement is turned OFF, Express Cash Register is also turned OFF automatically
  if (sanitized.cash_settlement === false) {
    sanitized.cash_register = false;
  }
  return sanitized;
}

export { useFeatureFlagsStore, cashierPageTitle, wereFeatureFlagsStored } from '../store/featureFlagsStore';