import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useCartStore } from '../../../store/cartStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from '../../../store/tabStore';
import { useAuthStore, isTokenExpired } from '../../../store/authStore';
import { useScaleStore } from '../../../store/scaleStore';
import { isAdminRole } from '../../../utils/security/permissions';
import { isAiAssistantAvailable, type FeatureFlags, type FeatureKey } from '../../../config/featureFlags';
import { isDesktopRuntime } from '../../../data/client';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { bridgeEvents } from '../../../data/events';

type ScreenFlag = 'setShowVariantsManager' | 'setShowGstReports' | 'setShowVatReports' | 'setShowAdsManager' | 'setShowAiAssistant' | 'setShowCashierSettlement' | 'setShowComboManager' | 'setShowCustomersPage' | 'setShowEcommercePortal' | 'setShowFinancialReport' | 'setShowInventoryManager' | 'setShowPartyManager' | 'setShowPaymentsPage' | 'setShowPurchaseBillManager' | 'setShowQuotationManager' | 'setShowRecycleBin' | 'setShowReturnManager' | 'setShowSalesHistory' | 'setShowScrapManager' | 'setShowSessionExpiredModal' | 'setShowSettingsGrades' | 'setShowSettingsManager' | 'setShowSettingsPricingTiers' | 'setShowStaffManager' | 'setShowStockReport' | 'setShowWarrantyManager';

/** The App state the screen events drive: one setter per full-screen view plus the targets some screens open with. */
export type ScreenEventsContext = Record<ScreenFlag, Dispatch<SetStateAction<boolean>>> & {
  featureFlagsRef: RefObject<FeatureFlags | null>;
  enableScrapRef: RefObject<boolean>;
  setRecycleBinCategory: Dispatch<SetStateAction<'SALES_BILLS' | 'PRODUCTS' | 'CUSTOMERS' | 'PARTIES'>>;
  setRestrictedActivePage: Dispatch<SetStateAction<string>>;
  setScrapManagerInitialView: Dispatch<SetStateAction<string>>;
};

/** Window events that open full-screen views (`open-inventory-manager`, `open-sales-history`, ..., `open-edit-bill`),
 * registered once, plus the main-process events that drive the shell. Moved verbatim from App.tsx; setters and refs
 * are stable, so the handlers read them from a ref. */
export function useScreenEvents(ctx: ScreenEventsContext): void {
  const ctxRef = useRef(ctx);
  useLayoutEffect(() => {
    ctxRef.current = ctx;
  });
  useEffect(() => {
    const { enableScrapRef, featureFlagsRef, setShowGstReports, setShowVatReports, setRecycleBinCategory, setRestrictedActivePage, setScrapManagerInitialView, setShowAdsManager, setShowAiAssistant, setShowCashierSettlement, setShowComboManager, setShowCustomersPage, setShowEcommercePortal, setShowFinancialReport, setShowInventoryManager, setShowVariantsManager, setShowPartyManager, setShowPaymentsPage, setShowPurchaseBillManager, setShowQuotationManager, setShowRecycleBin, setShowReturnManager, setShowSalesHistory, setShowScrapManager, setShowSessionExpiredModal, setShowSettingsGrades, setShowSettingsManager, setShowSettingsPricingTiers, setShowStaffManager, setShowStockReport, setShowWarrantyManager } = ctxRef.current;
    const canOpen = (key: FeatureKey) => {
      if (key === 'ai_assistant') {
        return isAiAssistantAvailable && (featureFlagsRef.current ? featureFlagsRef.current.ai_assistant !== false : true);
      }
      if (key === 'recycle_bin') {
        return featureFlagsRef.current ? featureFlagsRef.current.recycle_bin !== false : true;
      }
      return Boolean(featureFlagsRef.current?.[key]);
    };
    const handleOpenVariants = () => { if (canOpen('inventory')) setShowVariantsManager(true); };
    const handleOpenInv = () => { if (canOpen('inventory')) setShowInventoryManager(true); };
    const handleOpenStockReport = () => { if (canOpen('stock_report')) setShowStockReport(true); };
    const handleOpenGstReports = () => {
      if (!canOpen('gst_reports')) return;
      if (isUaeStore()) {
        setShowVatReports(true);
      } else {
        setShowGstReports(true);
      }
    };
    const handleOpenVatReports = () => {
      if (canOpen('gst_reports')) setShowVatReports(true);
    };
    const handleOpenHistory = () => { if (canOpen('sales_history')) setShowSalesHistory(true); };
    const handleOpenStaff = () => { if (canOpen('staff')) setShowStaffManager(true); };
    const handleOpenSettings = () => setShowSettingsManager(true);
    const handleOpenSettingsGrades = () => { if (canOpen('categories_grades')) setShowSettingsGrades(true); };
    const handleOpenSettingsPricingTiers = () => { if (canOpen('pricing_tiers')) setShowSettingsPricingTiers(true); };
    const handleOpenParties = () => { if (canOpen('parties')) setShowPartyManager(true); };
    const handleOpenScrapManager = (e: Event) => { if (enableScrapRef.current && canOpen('scrap')) { const ce = e as CustomEvent; if (ce.detail?.initialView) setScrapManagerInitialView(ce.detail.initialView); setShowScrapManager(true); } };
    const handleOpenQuotationManager = () => { if (canOpen('quotations')) setShowQuotationManager(true); };
    const handleOpenWarrantyManager = () => { if (canOpen('warranties')) setShowWarrantyManager(true); };
    const handleOpenReturnManager = () => { if (canOpen('returns')) setShowReturnManager(true); };
    const handleOpenCashierSettlement = () => { if (canOpen('cash_settlement') || canOpen('cash_register')) setShowCashierSettlement(true); };
    const handleOpenPurchaseBillManager = () => { if (canOpen('purchase_bills')) setShowPurchaseBillManager(true); };
    const handleOpenCustomersPage = () => { if (canOpen('customers')) setShowCustomersPage(true); };
    const handleOpenPaymentsPage = () => { if (canOpen('payments')) setShowPaymentsPage(true); };
    const handleOpenEcommerce = () => { if (canOpen('ecommerce')) setShowEcommercePortal(true); };
    const handleOpenNewQuotation = () => {
      if (!canOpen('quotations')) return;
      useCartStore.getState().setRole('BILLER');
      useCartStore.getState().clearCart();
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setIsScrapMode(false);
      useCartStore.getState().setEditingQuotation(null, null);
      useCartStore.getState().setEditingInvoice(null, null, null);
      useCartStore.getState().setQuotationMode(true);
      localStorage.setItem('pendingNewQuotation', 'true');

      const quotationSnapshot: TabSnapshot = {
        items: [],
        invoiceType: 'BILL_OF_SUPPLY',
        discountType: 'FIXED',
        discountValue: 0,
        customerState: 'KL',
        scrapDeduction: 0,
        scrapInvoiceNumber: '',
        returnDeduction: 0,
        returnInvoiceNumber: '',
        isQuotationMode: true,
        isReturnMode: false,
        isScrapMode: false,
        returnRefundMethod: 'ADJUST_BILL',
        editingQuotationId: null,
        editingQuotationNumber: null,
        editingInvoiceId: null,
        editingInvoiceNumber: null,
        editingInvoiceRole: null,
        pendingScrapInvoiceToEdit: null,
      };

      const tabStore = useTabStore.getState();
      const existingTabs = tabStore.tabs;
      const currentActiveTabId = tabStore.activeTabId;
      const activeTab = existingTabs.find(t => t.id === currentActiveTabId);

      if (activeTab && (!activeTab.snapshot?.items || activeTab.snapshot.items.length === 0) && !activeTab.snapshot?.editingInvoiceNumber) {
        const updated = existingTabs.map(t => t.id === currentActiveTabId ? {
          ...t,
          title: 'New Quote',
          customerName: '',
          customerPhone: '',
          customerGstin: '',
          customerAddress: '',
          receivedAmount: 0,
          reservedInvoiceNumber: '',
          reservedQuotationNumber: '',
          snapshot: quotationSnapshot,
        } : t);
        useTabStore.setState({ tabs: updated });
        saveStoredTabs(updated, currentActiveTabId);
      } else {
        tabStore.addTab(quotationSnapshot, 'New Quote');
      }

      setShowQuotationManager(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setRestrictedActivePage('BILLING');
    };

    const handleOpenQuotationEdit = () => {
      if (!canOpen('quotations')) return;
      useCartStore.getState().setRole('BILLER');
      setShowQuotationManager(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setRestrictedActivePage('BILLING');
    };

    // Close all overlays and navigate to BillingPage in return mode
    const handleOpenReturnMode = () => {
      if (!canOpen('returns')) return;
      useCartStore.getState().setRole('BILLER');
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowQuotationManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setRestrictedActivePage('BILLING');
    };

    // Close all overlays and navigate to BillingPage in scrap edit mode
    const handleOpenScrapEdit = () => {
      if (!canOpen('scrap') || !enableScrapRef.current) return;
      useCartStore.getState().setRole('BILLER');
      useCartStore.getState().setReturnMode(false);
      useCartStore.getState().setQuotationMode(false);
      useCartStore.getState().setIsScrapMode(true);
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowQuotationManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setRestrictedActivePage('BILLING');
    };

    const handleOpenEditBill = () => {
      useCartStore.getState().setRole('BILLER');
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowQuotationManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setRestrictedActivePage('BILLING');
    };

    const handleOpenBilling = () => {
      if (!canOpen('billing')) return;
      if (isAdminRole(useAuthStore.getState().role)) {
        useCartStore.getState().setRole('BILLER');
      }
      setShowQuotationManager(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setShowComboManager(false);
      setShowFinancialReport(false);
      setShowAiAssistant(false);
      setShowAdsManager(false);
      setRestrictedActivePage('BILLING');
    };

    const handleOpenDashboard = () => {
      setShowQuotationManager(false);
      setShowInventoryManager(false);
      setShowVariantsManager(false);
      setShowStockReport(false);
      setShowSalesHistory(false);
      setShowRecycleBin(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowSettingsGrades(false);
      setShowSettingsPricingTiers(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowWarrantyManager(false);
      setShowReturnManager(false);
      setShowPurchaseBillManager(false);
      setShowCustomersPage(false);
      setShowPaymentsPage(false);
      setShowCashierSettlement(false);
      setShowComboManager(false);
      setShowFinancialReport(false);
      setShowAiAssistant(false);
      setShowAdsManager(false);
      setRestrictedActivePage('');
    };

    const handleOpenComboManager = () => { if (canOpen('combo_offers')) setShowComboManager(true); };
    const handleOpenAdsManager = () => { if (canOpen('advertisements')) setShowAdsManager(true); };
    const handleOpenFinancialReport = () => { if (canOpen('financial_reports')) setShowFinancialReport(true); };
    const handleOpenAiAssistant = () => {
      if (isAiAssistantAvailable && canOpen('ai_assistant')) {
        setShowAiAssistant(true);
      }
    };
    window.addEventListener('open-billing-page', handleOpenBilling);
    window.addEventListener('open-dashboard', handleOpenDashboard);
    if (isAiAssistantAvailable) {
      window.addEventListener('open-ai-assistant', handleOpenAiAssistant);
    }
    window.addEventListener('open-inventory-manager', handleOpenInv);
    window.addEventListener('open-combo-manager', handleOpenComboManager);
    window.addEventListener('open-ads-manager', handleOpenAdsManager);
    window.addEventListener('open-financial-report', handleOpenFinancialReport);
    window.addEventListener('open-stock-report', handleOpenStockReport);
    window.addEventListener('open-gst-reports', handleOpenGstReports);
    window.addEventListener('open-vat-reports', handleOpenVatReports);
    window.addEventListener('open-sales-history', handleOpenHistory);
    const handleOpenRecycleBin = (e?: Event) => {
      if (!canOpen('recycle_bin')) return;
      const ce = e as CustomEvent;
      if (ce?.detail?.initialCategory) {
        setRecycleBinCategory(ce.detail.initialCategory);
      } else {
        setRecycleBinCategory('SALES_BILLS');
      }
      setShowRecycleBin(true);
    };
    window.addEventListener('open-recycle-bin', handleOpenRecycleBin);
    window.addEventListener('open-staff-manager', handleOpenStaff);
    window.addEventListener('open-settings-manager', handleOpenSettings);
    window.addEventListener('open-settings-grades', handleOpenSettingsGrades);
    window.addEventListener('open-product-variants', handleOpenVariants);
    window.addEventListener('open-settings-pricing-tiers', handleOpenSettingsPricingTiers);
    window.addEventListener('open-parties-manager', handleOpenParties);
    window.addEventListener('open-scrap-manager', handleOpenScrapManager);
    window.addEventListener('open-quotation-manager', handleOpenQuotationManager);
    window.addEventListener('open-warranty-manager', handleOpenWarrantyManager);
    window.addEventListener('open-returns-manager', handleOpenReturnManager);
    window.addEventListener('open-purchase-bills', handleOpenPurchaseBillManager);
    window.addEventListener('open-customers-page', handleOpenCustomersPage);
    window.addEventListener('open-payments-page', handleOpenPaymentsPage);
    window.addEventListener('open-ecommerce-portal', handleOpenEcommerce);
    window.addEventListener('open-cashier-settlement', handleOpenCashierSettlement);
    window.addEventListener('open-new-quotation', handleOpenNewQuotation);
    window.addEventListener('open-quotation-edit', handleOpenQuotationEdit);
    window.addEventListener('open-return-mode', handleOpenReturnMode);
    window.addEventListener('edit-scrap-invoice', handleOpenScrapEdit);
    window.addEventListener('open-edit-bill', handleOpenEditBill);

    let unsubscribeTokenExpired: (() => void) | undefined;
    let unsubscribeScale: (() => void) | undefined;
    if (isDesktopRuntime()) {
      const unsub = bridgeEvents.onTokenExpired(() => {
        const currentToken = useAuthStore.getState().token;
        if (currentToken && !isTokenExpired(currentToken)) {
          console.warn('[App] Received token-expired event, but active token is valid. Suppressing session expired modal.');
          return;
        }
        console.warn('[App] Cloud session expired or unauthorized. Showing session expired modal...');
        useAuthStore.getState().setCloudSyncPaused(true, 'Token expired — Cloud Sync paused. Re-login to resume cloud sync.');
        setShowSessionExpiredModal(true);
      });
      if (typeof unsub === 'function') {
        unsubscribeTokenExpired = unsub;
      }

      unsubscribeScale = bridgeEvents.onScaleWeight((weight) => {
        useScaleStore.getState().setLiveWeight(weight);
      });
    }

    const handleOpenSessionExpiredModal = () => {
      const currentToken = useAuthStore.getState().token;
      if (currentToken && !isTokenExpired(currentToken) && !useAuthStore.getState().isCloudSyncPaused) {
        return;
      }
      setShowSessionExpiredModal(true);
    };
    window.addEventListener('open-session-expired-modal', handleOpenSessionExpiredModal);

    return () => {
      if (unsubscribeTokenExpired) {
        unsubscribeTokenExpired();
      }
      if (unsubscribeScale) {
        unsubscribeScale();
      }
      window.removeEventListener('open-session-expired-modal', handleOpenSessionExpiredModal);
      window.removeEventListener('open-billing-page', handleOpenBilling);
      window.removeEventListener('open-dashboard', handleOpenDashboard);
      if (isAiAssistantAvailable) {
        window.removeEventListener('open-ai-assistant', handleOpenAiAssistant);
      }
      window.removeEventListener('open-inventory-manager', handleOpenInv);
      window.removeEventListener('open-combo-manager', handleOpenComboManager);
      window.removeEventListener('open-ads-manager', handleOpenAdsManager);
      window.removeEventListener('open-financial-report', handleOpenFinancialReport);
      window.removeEventListener('open-stock-report', handleOpenStockReport);
      window.removeEventListener('open-gst-reports', handleOpenGstReports);
      window.removeEventListener('open-vat-reports', handleOpenVatReports);
      window.removeEventListener('open-sales-history', handleOpenHistory);
      window.removeEventListener('open-staff-manager', handleOpenStaff);
      window.removeEventListener('open-settings-manager', handleOpenSettings);
      window.removeEventListener('open-settings-grades', handleOpenSettingsGrades);
      window.removeEventListener('open-product-variants', handleOpenVariants);
      window.removeEventListener('open-settings-pricing-tiers', handleOpenSettingsPricingTiers);
      window.removeEventListener('open-parties-manager', handleOpenParties);
      window.removeEventListener('open-scrap-manager', handleOpenScrapManager);
      window.removeEventListener('open-quotation-manager', handleOpenQuotationManager);
      window.removeEventListener('open-warranty-manager', handleOpenWarrantyManager);
      window.removeEventListener('open-returns-manager', handleOpenReturnManager);
      window.removeEventListener('open-purchase-bills', handleOpenPurchaseBillManager);
      window.removeEventListener('open-customers-page', handleOpenCustomersPage);
      window.removeEventListener('open-payments-page', handleOpenPaymentsPage);
      window.removeEventListener('open-ecommerce-portal', handleOpenEcommerce);
      window.removeEventListener('open-cashier-settlement', handleOpenCashierSettlement);
      window.removeEventListener('open-new-quotation', handleOpenNewQuotation);
      window.removeEventListener('open-quotation-edit', handleOpenQuotationEdit);
      window.removeEventListener('open-return-mode', handleOpenReturnMode);
      window.removeEventListener('edit-scrap-invoice', handleOpenScrapEdit);
      window.removeEventListener('open-edit-bill', handleOpenEditBill);
    };
  }, []);
}
