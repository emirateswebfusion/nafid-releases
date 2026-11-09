/**
 * Screens loaded on demand: each becomes its own chunk, so startup parses only the shell (login, dashboard, prompts)
 * instead of the whole POS. App.tsx renders these under a <Suspense> boundary. Add a new full-screen view here rather
 * than importing it statically in App.tsx.
 */
import { lazy } from 'react';

const loadBilling = () => import('../billing/BillingPage');
export const BillingPage = lazy(() => loadBilling().then((m) => ({ default: m.BillingPage })));
export const ComboManager = lazy(() => import('../combo/ComboManager').then((m) => ({ default: m.ComboManager })));
export const InventoryManager = lazy(() => import('../inventory/InventoryManager').then((m) => ({ default: m.InventoryManager })));
export const SalesHistory = lazy(() => import('../sales/SalesHistory').then((m) => ({ default: m.SalesHistory })));
export const RecycleBin = lazy(() => import('../recycle-bin/RecycleBin').then((m) => ({ default: m.RecycleBin })));
export const StaffManager = lazy(() => import('../staff/StaffManager').then((m) => ({ default: m.StaffManager })));
export const SettingsManager = lazy(() => import('../settings/SettingsManager').then((m) => ({ default: m.SettingsManager })));
export const SettingsGrades = lazy(() => import('../settings-grades/SettingsGrades').then((m) => ({ default: m.SettingsGrades })));
export const PricingTiers = lazy(() => import('../pricing-tiers/PricingTiers').then((m) => ({ default: m.PricingTiers })));
export const PartyManager = lazy(() => import('../party/PartyManager').then((m) => ({ default: m.PartyManager })));
export const CashierSettlement = lazy(() => import('../cashier/CashierSettlement').then((m) => ({ default: m.CashierSettlement })));
export const PaymentMethods = lazy(() => import('../payment-methods/PaymentMethods').then((m) => ({ default: m.PaymentMethods })));
export const ScrapManager = lazy(() => import('../scrap/ScrapManager').then((m) => ({ default: m.ScrapManager })));
export const QuotationManager = lazy(() => import('../quotation/QuotationManager').then((m) => ({ default: m.QuotationManager })));
export const RestaurantPage = lazy(() => import('../restaurant/RestaurantPage').then((m) => ({ default: m.RestaurantPage })));
export const WarrantyManager = lazy(() => import('../warranty/WarrantyManager').then((m) => ({ default: m.WarrantyManager })));
export const ReturnManager = lazy(() => import('../returns/ReturnManager').then((m) => ({ default: m.ReturnManager })));
export const StockReport = lazy(() => import('../stock-report/StockReport').then((m) => ({ default: m.StockReport })));
export const FinancialReport = lazy(() => import('../reports/FinancialReport').then((m) => ({ default: m.FinancialReport })));
export const GstReportScreen = lazy(() => import('../reports/GstReportScreen').then((m) => ({ default: m.GstReportScreen })));
export const VatReportScreen = lazy(() => import('../reports/VatReportScreen').then((m) => ({ default: m.VatReportScreen })));
export const PurchaseBillManager = lazy(() => import('../purchase/PurchaseBillManager').then((m) => ({ default: m.PurchaseBillManager })));
export const CustomersPage = lazy(() => import('../customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
export const AiAssistant = lazy(() => import('../ai-assistant/AiAssistant').then((m) => ({ default: m.AiAssistant })));
export const EcommercePortal = lazy(() => import('../ecommerce/EcommercePortal').then((m) => ({ default: m.EcommercePortal })));
export const AdsManager = lazy(() => import('../ads/AdsManager').then((m) => ({ default: m.AdsManager })));
export const NotificationsPage = lazy(() => import('../notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
export const SuperDashboard = lazy(() => import('../super-dashboard/SuperDashboard'));

/** Fetches the billing chunk in the background after sign-in, so the most used screen still opens instantly. */
export function preloadBilling(): void {
  void loadBilling();
}

export const VariantsManager = lazy(() => import('../variants/VariantsManager').then(m => ({ default: m.VariantsManager })));
