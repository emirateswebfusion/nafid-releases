import { Suspense, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { AdsManager, AiAssistant, BillingPage, CashierSettlement, ComboManager, CustomersPage, EcommercePortal, FinancialReport, GstReportScreen, VatReportScreen, InventoryManager, PartyManager, PaymentMethods, PricingTiers, PurchaseBillManager, QuotationManager, RecycleBin, ReturnManager, SalesHistory, ScrapManager, SettingsGrades, SettingsManager, StaffManager, StockReport, SuperDashboard, WarrantyManager, RestaurantPage, preloadBilling, VariantsManager } from './components/app/lazyScreens';
import UpdateBanner from './components/app/UpdateBanner';
import { useStartupReady } from './components/app/hooks/useStartupReady';
import { PermissionGuard } from './components/app/PermissionGuard';
import { LoginScreen } from './components/auth/LoginScreen';
import { OwnerDashboard } from './components/owner-dashboard/OwnerDashboard';
import { useCartStore } from './store/cartStore';
import { useTabStore } from './store/tabStore';
import { useAuthStore } from './store/authStore';
import { getSetting } from './data/settings';
import { setAppTimeFormat } from './utils/print/receiptGenerator';
import { useStoreProfile } from './hooks/useStoreProfile';
import { CashDrawerAutoCloseWatcher } from './components/cashier/CashDrawerAutoCloseWatcher';
import { SessionExpiredModal } from './components/app/SessionExpiredModal';
import { CardTerminalDialog } from './components/app/CardTerminalDialog';
import { useFeatureFlagsStore, isAiAssistantAvailable } from './config/featureFlags';
import { SplashScreen } from './components/app/SplashScreen';
import { useEmergencyPanicTrigger } from './hooks/useEmergencyPanicTrigger';
import { EmergencyWipePrompt } from './components/app/EmergencyWipePrompt';
import { isDesktopRuntime } from './data/client';
import { useSyncStatus } from './components/app/hooks/useSyncStatus';
import { useScreenEvents } from './components/app/hooks/useScreenEvents';
import { useFeatureFlagsRefresh } from './components/app/hooks/useFeatureFlagsRefresh';
import { SYNC_QUOTES } from './components/owner-dashboard/syncQuotes';

function App() {
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showFinancialReport, setShowFinancialReport] = useState(false);
  const [showGstReports, setShowGstReports] = useState(false);
  const [showVatReports, setShowVatReports] = useState(false);

  const panic = useEmergencyPanicTrigger();

  const { tenantId, isAuthenticated, isLoading, checkAuth, role, isCloudSyncPaused } = useAuthStore();
  useFeatureFlagsRefresh(tenantId, isAuthenticated);
  const profileReady = useStoreProfile(tenantId, isAuthenticated);
  useStartupReady(!isLoading && (!isAuthenticated || profileReady));
  const [restrictedActivePage, setRestrictedActivePage] = useState<string>('');
  const [showVariantsManager, setShowVariantsManager] = useState(false);
  const [showInventoryManager, setShowInventoryManager] = useState(false);
  const [showComboManager, setShowComboManager] = useState(false);
  const [showStockReport, setShowStockReport] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [recycleBinCategory, setRecycleBinCategory] = useState<'SALES_BILLS' | 'PRODUCTS' | 'CUSTOMERS' | 'PARTIES'>('SALES_BILLS');
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [showSettingsManager, setShowSettingsManager] = useState(false);
  const [showSettingsGrades, setShowSettingsGrades] = useState(false);
  const [showSettingsPricingTiers, setShowSettingsPricingTiers] = useState(false);
  const [showPartyManager, setShowPartyManager] = useState(false);
  const [partyTarget, setPartyTarget] = useState<string | undefined>(undefined);
  const [showScrapManager, setShowScrapManager] = useState(false);
  const [scrapManagerInitialView, setScrapManagerInitialView] = useState<string>('list');
  const [enableScrap, setEnableScrap] = useState(false);
  const enableScrapRef = useRef(false);
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
  const featureFlagsRef = useRef(featureFlags);
  useLayoutEffect(() => {
    enableScrapRef.current = enableScrap;
  });
  useLayoutEffect(() => {
    featureFlagsRef.current = featureFlags;
  });
  const [showQuotationManager, setShowQuotationManager] = useState(false);
  const [showWarrantyManager, setShowWarrantyManager] = useState(false);
  const [showRestaurant, setShowRestaurant] = useState(false);
  const [restaurantView, setRestaurantView] = useState<'floor' | 'tokens' | 'kitchen'>('floor');
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>();
  useEffect(() => {
    const openPage = (view: 'floor' | 'tokens' | 'kitchen', key: 'dining_tables' | 'takeaway_delivery' | 'kitchen_display') => () => {
      if (!featureFlagsRef.current?.restaurant_mode || !featureFlagsRef.current[key]) return;
      setRestaurantView(view); setShowRestaurant(true);
    };
    const floor = openPage('floor', 'dining_tables');
    const tokens = openPage('tokens', 'takeaway_delivery');
    const kitchen = openPage('kitchen', 'kitchen_display');
    const setup = () => {
      if (!featureFlagsRef.current?.restaurant_mode) return;
      setRestaurantView('floor'); setShowRestaurant(true);
    };
    const dashboard = () => setShowRestaurant(false);
    const events: [string, () => void][] = [['open-restaurant', floor], ['open-tables', floor], ['open-takeaway-delivery', tokens], ['open-kitchen-display', kitchen], ['open-restaurant-setup', setup], ['open-dashboard', dashboard], ['open-billing-page', dashboard]];
    events.forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, []);
  const [showReturnManager, setShowReturnManager] = useState(false);
  const [showPurchaseBillManager, setShowPurchaseBillManager] = useState(false);
  const [showCashierSettlement, setShowCashierSettlement] = useState(false);
  const [showCustomersPage, setShowCustomersPage] = useState(false);
  const [showEcommercePortal, setShowEcommercePortal] = useState(false);
  const [showAdsManager, setShowAdsManager] = useState(false);
  const [cameFromCustomers, setCameFromCustomers] = useState(false);
  const [customerTarget, setCustomerTarget] = useState<string | undefined>(undefined);
  const [showPaymentsPage, setShowPaymentsPage] = useState(false);
  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // If running in browser dev mode and a pathname like /login is entered, clean it up
    if (!isDesktopRuntime() && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const { isSyncing, syncProgress, syncComplete, shuffledQuotes, quoteIndex } = useSyncStatus({ isAuthenticated, isCloudSyncPaused });

  useEffect(() => {
    if (!isDesktopRuntime() || !isAuthenticated) return;
    const tid = useAuthStore.getState().tenantId;
    getSetting({ tenant_id: tid || 'global', key: 'enable_scrap' }).then((v: unknown) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
    loadFlags(tid || 'global');
    getSetting({ tenant_id: tid || 'global', key: 'time_format' }).then((v: unknown) => {
      if (v === '24h' || v === '12h') {
        setAppTimeFormat(v);
      } else {
        setAppTimeFormat('12h');
      }
    });


    const handleSettingsUpdated = () => {
      const currentTid = useAuthStore.getState().tenantId;
      loadFlags(currentTid || 'global');
      getSetting({ tenant_id: currentTid || 'global', key: 'enable_scrap' }).then((v: unknown) => {
        if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
      });
      getSetting({ tenant_id: currentTid || 'global', key: 'time_format' }).then((v: unknown) => {
        if (v === '24h' || v === '12h') setAppTimeFormat(v);
      });

    };
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('settings:updated', handleSettingsUpdated);
    };
  }, [isAuthenticated, loadFlags]);

  useScreenEvents({
    enableScrapRef, featureFlagsRef, setRecycleBinCategory, setRestrictedActivePage, setScrapManagerInitialView, setShowAdsManager, setShowAiAssistant, setShowCashierSettlement, setShowComboManager, setShowCustomersPage, setShowEcommercePortal, setShowFinancialReport, setShowGstReports, setShowVatReports, setShowInventoryManager, setShowVariantsManager, setShowPartyManager, setShowPaymentsPage, setShowPurchaseBillManager, setShowQuotationManager, setShowRecycleBin, setShowReturnManager, setShowSalesHistory, setShowScrapManager, setShowSessionExpiredModal, setShowSettingsGrades, setShowSettingsManager, setShowSettingsPricingTiers, setShowStaffManager, setShowStockReport, setShowWarrantyManager,
  });

  // Fetch the billing chunk in the background once signed in (screens are lazy, see lazyScreens.ts).
  useEffect(() => {
    if (isAuthenticated && profileReady) preloadBilling();
  }, [isAuthenticated, profileReady]);

  if (isLoading || (isAuthenticated && !profileReady)) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (role === 'SUPER_ADMIN') {
    return <Suspense fallback={<ScreenLoading />}><SuperDashboard /></Suspense>;
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      <div className="absolute top-0 left-0 right-0 z-50">
        <UpdateBanner onOpenSettings={() => setShowSettingsManager(true)} />
      </div>
      <CashDrawerAutoCloseWatcher />

      <Suspense fallback={<ScreenLoading />}>
      {showRestaurant ? (
        <PermissionGuard feature={restaurantView === 'floor' ? 'dining_tables' : restaurantView === 'tokens' ? 'takeaway_delivery' : 'kitchen_display'} permission="restaurant.orders" onBack={() => setShowRestaurant(false)}>
          <RestaurantPage key={restaurantView} view={restaurantView} onClose={() => setShowRestaurant(false)} />
        </PermissionGuard>
      ) : showComboManager ? (
        <PermissionGuard feature="combo_offers" permission="combos.view" onBack={() => setShowComboManager(false)}>
          <ComboManager onClose={() => setShowComboManager(false)} />
        </PermissionGuard>
      ) : showPartyManager ? (
        <PermissionGuard feature="parties" permission="customers.view" onBack={() => {
          setShowPartyManager(false);
          setPartyTarget(undefined);
          if (cameFromCustomers) {
            setCameFromCustomers(false);
            setShowCustomersPage(true);
          }
        }}>
          <PartyManager
            initialPartyIdOrQuery={partyTarget}
            onClose={() => {
              setShowPartyManager(false);
              setPartyTarget(undefined);
              if (cameFromCustomers) {
                setCameFromCustomers(false);
                setShowCustomersPage(true);
              }
            }}
            onBackToCustomers={cameFromCustomers ? () => {
              setShowPartyManager(false);
              setPartyTarget(undefined);
              setCameFromCustomers(false);
              setShowCustomersPage(true);
            } : undefined}
          />
        </PermissionGuard>
      ) : showCashierSettlement ? (
        <PermissionGuard feature="cash_settlement" permission="cash_register.view" onBack={() => setShowCashierSettlement(false)}>
          <CashierSettlement onClose={() => setShowCashierSettlement(false)} />
        </PermissionGuard>
      ) : showScrapManager ? (
        <PermissionGuard feature="scrap" permission="scrap.view" onBack={() => setShowScrapManager(false)}>
          <ScrapManager onClose={() => { setShowScrapManager(false); setScrapManagerInitialView('list'); }} initialView={scrapManagerInitialView as import('./components/scrap/scrapTypes').View} />
        </PermissionGuard>
      ) : showQuotationManager ? (
        <PermissionGuard feature="quotations" permission="quotations.view" onBack={() => setShowQuotationManager(false)}>
          <QuotationManager onClose={() => setShowQuotationManager(false)} />
        </PermissionGuard>
      ) : showReturnManager ? (
        <PermissionGuard feature="returns" permission="sales.refund" onBack={() => {
          setShowReturnManager(false);
          useCartStore.getState().setReturnMode(false);
          useTabStore.getState().updateActiveTab({
            customerName: '',
            customerPhone: '',
            customerGstin: '',
            customerAddress: '',
            customerId: '',
            receivedAmount: 0,
            actualRefundPaid: 0,
            reservedReturnNumber: '',
          });
        }}>
          <ReturnManager onClose={() => {
            setShowReturnManager(false);
            useCartStore.getState().setReturnMode(false);
            useTabStore.getState().updateActiveTab({
              customerName: '',
              customerPhone: '',
              customerGstin: '',
              customerAddress: '',
              customerId: '',
              receivedAmount: 0,
              actualRefundPaid: 0,
              reservedReturnNumber: '',
            });
          }} />
        </PermissionGuard>
      ) : showWarrantyManager ? (
        <PermissionGuard feature="warranties" permission="warranties.view" onBack={() => setShowWarrantyManager(false)}>
          <WarrantyManager onClose={() => setShowWarrantyManager(false)} />
        </PermissionGuard>
      ) : showPurchaseBillManager ? (
        <PermissionGuard feature="purchase_bills" permission="purchases.view" onBack={() => setShowPurchaseBillManager(false)}>
          <PurchaseBillManager onClose={() => setShowPurchaseBillManager(false)} />
        </PermissionGuard>
      ) : showCustomersPage ? (
        <PermissionGuard feature="customers" permission="customers.view" onBack={() => {
          setShowCustomersPage(false);
          setCustomerTarget(undefined);
        }}>
          <CustomersPage
            initialCustomerIdOrQuery={customerTarget}
            onClose={() => {
              setShowCustomersPage(false);
              setCustomerTarget(undefined);
            }}
            onOpenParty={(pTarget, cTarget) => {
              setShowCustomersPage(false);
              setPartyTarget(pTarget);
              setCustomerTarget(cTarget);
              setCameFromCustomers(true);
              setShowPartyManager(true);
            }}
          />
        </PermissionGuard>
      ) : showPaymentsPage ? (
        <PermissionGuard feature="payments" permission="settings.view" onBack={() => setShowPaymentsPage(false)}>
          <PaymentMethods onClose={() => setShowPaymentsPage(false)} />
        </PermissionGuard>
      ) : showStaffManager ? (
        <PermissionGuard feature="staff" permission="users.view" onBack={() => setShowStaffManager(false)}>
          <StaffManager onClose={() => setShowStaffManager(false)} />
        </PermissionGuard>
      ) : showSettingsManager ? (
        <PermissionGuard permission="settings.view" onBack={() => setShowSettingsManager(false)}>
          <SettingsManager initialSection={settingsInitialSection} onClose={() => { setShowSettingsManager(false); setSettingsInitialSection(undefined); }} />
        </PermissionGuard>
      ) : showSettingsGrades ? (
        <PermissionGuard feature="categories_grades" permission="products.view" onBack={() => setShowSettingsGrades(false)}>
          <SettingsGrades onClose={() => setShowSettingsGrades(false)} />
        </PermissionGuard>
      ) : showSettingsPricingTiers ? (
        <PermissionGuard feature="pricing_tiers" permission="combos.view" onBack={() => setShowSettingsPricingTiers(false)}>
          <PricingTiers onClose={() => setShowSettingsPricingTiers(false)} />
        </PermissionGuard>
      ) : showRecycleBin ? (
        <PermissionGuard feature="recycle_bin" permission="sales.view" onBack={() => setShowRecycleBin(false)}>
          <RecycleBin
            initialCategory={recycleBinCategory}
            onClose={() => setShowRecycleBin(false)}
            onNavigateToSalesHistory={() => {
              setShowRecycleBin(false);
              setShowSalesHistory(true);
            }}
          />
        </PermissionGuard>
      ) : showSalesHistory ? (
        <PermissionGuard feature="sales_history" permission="sales.view" onBack={() => setShowSalesHistory(false)}>
          <SalesHistory onClose={() => setShowSalesHistory(false)} />
        </PermissionGuard>
      ) : showVariantsManager ? (
        <PermissionGuard feature="inventory" permission="products.view" onBack={() => setShowVariantsManager(false)}>
          <VariantsManager onClose={() => setShowVariantsManager(false)} />
        </PermissionGuard>
      ) : showInventoryManager ? (
        <PermissionGuard feature="inventory" permission="products.view" onBack={() => setShowInventoryManager(false)}>
          <InventoryManager onClose={() => setShowInventoryManager(false)} />
        </PermissionGuard>
      ) : showStockReport ? (
        <PermissionGuard feature="stock_report" permission="reports.view" onBack={() => setShowStockReport(false)}>
          <StockReport onClose={() => setShowStockReport(false)} />
        </PermissionGuard>
      ) : showFinancialReport ? (
        <PermissionGuard feature="financial_reports" permission="reports.financial" onBack={() => setShowFinancialReport(false)}>
          <FinancialReport onClose={() => setShowFinancialReport(false)} />
        </PermissionGuard>
      ) : showVatReports ? (
        <PermissionGuard feature="gst_reports" permission="reports.view" onBack={() => setShowVatReports(false)}>
          <VatReportScreen onBack={() => setShowVatReports(false)} />
        </PermissionGuard>
      ) : showGstReports ? (
        <PermissionGuard feature="gst_reports" permission="reports.view" onBack={() => setShowGstReports(false)}>
          <GstReportScreen onBack={() => setShowGstReports(false)} />
        </PermissionGuard>
      ) : showEcommercePortal ? (
        <PermissionGuard feature="ecommerce" permission="products.view" onBack={() => setShowEcommercePortal(false)}>
          <EcommercePortal onClose={() => setShowEcommercePortal(false)} />
        </PermissionGuard>
      ) : showAdsManager ? (
        <PermissionGuard feature="advertisements" onBack={() => setShowAdsManager(false)}><AdsManager onClose={() => setShowAdsManager(false)} /></PermissionGuard>
      ) : (showAiAssistant && isAiAssistantAvailable) ? (
        <PermissionGuard feature="ai_assistant" onBack={() => setShowAiAssistant(false)}><AiAssistant onClose={() => setShowAiAssistant(false)} /></PermissionGuard>
      ) : restrictedActivePage === 'BILLING' ? (
        <PermissionGuard feature="billing" permission="sales.create" onBack={() => setRestrictedActivePage('')}>
          <BillingPage />
        </PermissionGuard>
      ) : (
        <OwnerDashboard
          isSyncing={isSyncing}
          syncProgress={syncProgress}
          syncComplete={syncComplete}
          shuffledQuotes={shuffledQuotes}
          quoteIndex={quoteIndex}
          QUOTES={SYNC_QUOTES}
        />
      )}
      </Suspense>
      <SessionExpiredModal
        isOpen={showSessionExpiredModal}
        onConfirm={() => {
          setShowSessionExpiredModal(false);
          try { sessionStorage.setItem('auth_prefer_email', 'true'); } catch { /* ignore */ }
          useAuthStore.getState().logout();
        }}
        onClose={() => {
          setShowSessionExpiredModal(false);
        }}
      />

      <CardTerminalDialog />
      <EmergencyWipePrompt panic={panic} />
    </div>
  );
}

/** Shown while a lazily loaded screen's chunk is fetched (usually a few milliseconds from disk). */
function ScreenLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

export default App;
