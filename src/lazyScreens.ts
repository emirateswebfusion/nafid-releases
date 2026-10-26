/**
 * Screens loaded on demand: each becomes its own chunk, so startup parses only the shell (login, dashboard, prompts)
 * instead of the whole POS. App.tsx renders these under a <Suspense> boundary. Add a new full-screen view here rather
 * than importing it statically in App.tsx.
 */
import { lazy } from 'react';

const loadBilling = () => import('./components/BillingPage');
export const BillingPage = lazy(() => loadBilling().then((m) => ({ default: m.BillingPage })));
export const ComboManager = lazy(() => import('./components/ComboManager').then((m) => ({ default: m.ComboManager })));
export const InventoryManager = lazy(() => import('./components/InventoryManager').then((m) => ({ default: m.InventoryManager })));
export const SalesHistory = lazy(() => import('./components/SalesHistory').then((m) => ({ default: m.SalesHistory })));
export const RecycleBin = lazy(() => import('./components/RecycleBin').then((m) => ({ default: m.RecycleBin })));
export const StaffManager = lazy(() => import('./components/StaffManager').then((m) => ({ default: m.StaffManager })));
export const SettingsManager = lazy(() => import('./components/SettingsManager').then((m) => ({ default: m.SettingsManager })));
export const SettingsGrades = lazy(() => import('./components/SettingsGrades').then((m) => ({ default: m.SettingsGrades })));
export const PricingTiers = lazy(() => import('./components/PricingTiers').then((m) => ({ default: m.PricingTiers })));
export const PartyManager = lazy(() => import('./components/PartyManager').then((m) => ({ default: m.PartyManager })));
export const CashierSettlement = lazy(() => import('./components/CashierSettlement').then((m) => ({ default: m.CashierSettlement })));
export const PaymentMethods = lazy(() => import('./components/PaymentMethods').then((m) => ({ default: m.PaymentMethods })));
export const PrintBarcodeView = lazy(() => import('./components/PrintBarcodeView').then((m) => ({ default: m.PrintBarcodeView })));
export const PrintReceiptView = lazy(() => import('./components/PrintReceiptView').then((m) => ({ default: m.PrintReceiptView })));
export const PrintBulkBarcodeView = lazy(() => import('./components/PrintBulkBarcodeView').then((m) => ({ default: m.PrintBulkBarcodeView })));
export const ScrapManager = lazy(() => import('./components/ScrapManager').then((m) => ({ default: m.ScrapManager })));
export const QuotationManager = lazy(() => import('./components/QuotationManager').then((m) => ({ default: m.QuotationManager })));
export const WarrantyManager = lazy(() => import('./components/WarrantyManager').then((m) => ({ default: m.WarrantyManager })));
export const ReturnManager = lazy(() => import('./components/ReturnManager').then((m) => ({ default: m.ReturnManager })));
export const PrintA4View = lazy(() => import('./components/PrintA4View').then((m) => ({ default: m.PrintA4View })));
export const StockReport = lazy(() => import('./components/StockReport').then((m) => ({ default: m.StockReport })));
export const FinancialReport = lazy(() => import('./components/FinancialReport').then((m) => ({ default: m.FinancialReport })));
export const PurchaseBillManager = lazy(() => import('./components/PurchaseBillManager').then((m) => ({ default: m.PurchaseBillManager })));
export const CustomersPage = lazy(() => import('./components/CustomersPage').then((m) => ({ default: m.CustomersPage })));
export const AiAssistant = lazy(() => import('./components/AiAssistant').then((m) => ({ default: m.AiAssistant })));
export const EcommercePortal = lazy(() => import('./components/EcommercePortal').then((m) => ({ default: m.EcommercePortal })));
export const AdsManager = lazy(() => import('./components/AdsManager').then((m) => ({ default: m.AdsManager })));
export const SuperDashboard = lazy(() => import('./components/SuperDashboard'));

/** Fetches the billing chunk in the background after sign-in, so the most used screen still opens instantly. */
export function preloadBilling(): void {
  void loadBilling();
}
