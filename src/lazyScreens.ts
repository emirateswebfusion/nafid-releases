/**
 * Screens loaded on demand: each becomes its own chunk, so startup parses only the shell (login, dashboard, prompts)
 * instead of the whole POS. App.tsx renders these under a <Suspense> boundary. Add a new full-screen view here rather
 * than importing it statically in App.tsx.
 */
import { lazy } from 'react';

const loadBilling = () => import('./components/billing/BillingPage');
export const BillingPage = lazy(() => loadBilling().then((m) => ({ default: m.BillingPage })));
export const ComboManager = lazy(() => import('./components/combo/ComboManager').then((m) => ({ default: m.ComboManager })));
export const InventoryManager = lazy(() => import('./components/inventory/InventoryManager').then((m) => ({ default: m.InventoryManager })));
export const SalesHistory = lazy(() => import('./components/sales/SalesHistory').then((m) => ({ default: m.SalesHistory })));
export const RecycleBin = lazy(() => import('./components/recycle-bin/RecycleBin').then((m) => ({ default: m.RecycleBin })));
export const StaffManager = lazy(() => import('./components/staff/StaffManager').then((m) => ({ default: m.StaffManager })));
export const SettingsManager = lazy(() => import('./components/settings/SettingsManager').then((m) => ({ default: m.SettingsManager })));
export const SettingsGrades = lazy(() => import('./components/settings-grades/SettingsGrades').then((m) => ({ default: m.SettingsGrades })));
export const PricingTiers = lazy(() => import('./components/pricing-tiers/PricingTiers').then((m) => ({ default: m.PricingTiers })));
export const PartyManager = lazy(() => import('./components/party/PartyManager').then((m) => ({ default: m.PartyManager })));
export const CashierSettlement = lazy(() => import('./components/cashier/CashierSettlement').then((m) => ({ default: m.CashierSettlement })));
export const PaymentMethods = lazy(() => import('./components/payment-methods/PaymentMethods').then((m) => ({ default: m.PaymentMethods })));
export const PrintBarcodeView = lazy(() => import('./components/print/PrintBarcodeView').then((m) => ({ default: m.PrintBarcodeView })));
export const PrintReceiptView = lazy(() => import('./components/print/PrintReceiptView').then((m) => ({ default: m.PrintReceiptView })));
export const PrintBulkBarcodeView = lazy(() => import('./components/print/PrintBulkBarcodeView').then((m) => ({ default: m.PrintBulkBarcodeView })));
export const ScrapManager = lazy(() => import('./components/scrap/ScrapManager').then((m) => ({ default: m.ScrapManager })));
export const QuotationManager = lazy(() => import('./components/quotation/QuotationManager').then((m) => ({ default: m.QuotationManager })));
export const WarrantyManager = lazy(() => import('./components/warranty/WarrantyManager').then((m) => ({ default: m.WarrantyManager })));
export const ReturnManager = lazy(() => import('./components/returns/ReturnManager').then((m) => ({ default: m.ReturnManager })));
export const PrintA4View = lazy(() => import('./components/print/PrintA4View').then((m) => ({ default: m.PrintA4View })));
export const StockReport = lazy(() => import('./components/stock-report/StockReport').then((m) => ({ default: m.StockReport })));
export const FinancialReport = lazy(() => import('./components/reports/FinancialReport').then((m) => ({ default: m.FinancialReport })));
export const PurchaseBillManager = lazy(() => import('./components/purchase/PurchaseBillManager').then((m) => ({ default: m.PurchaseBillManager })));
export const CustomersPage = lazy(() => import('./components/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
export const AiAssistant = lazy(() => import('./components/ai-assistant/AiAssistant').then((m) => ({ default: m.AiAssistant })));
export const EcommercePortal = lazy(() => import('./components/ecommerce/EcommercePortal').then((m) => ({ default: m.EcommercePortal })));
export const AdsManager = lazy(() => import('./components/ads/AdsManager').then((m) => ({ default: m.AdsManager })));
export const SuperDashboard = lazy(() => import('./components/super-dashboard/SuperDashboard'));

/** Fetches the billing chunk in the background after sign-in, so the most used screen still opens instantly. */
export function preloadBilling(): void {
  void loadBilling();
}
