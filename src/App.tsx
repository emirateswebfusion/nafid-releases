import { Suspense, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { AdsManager, AiAssistant, BillingPage, CashierSettlement, ComboManager, CustomersPage, EcommercePortal, FinancialReport, GstReportScreen, VatReportScreen, InventoryManager, PartyManager, PaymentMethods, PricingTiers, PurchaseBillManager, QuotationManager, RecycleBin, ReturnManager, SalesHistory, ScrapManager, SettingsGrades, SettingsManager, StaffManager, StockReport, SuperDashboard, WarrantyManager, RestaurantPage, preloadBilling } from './components/app/lazyScreens';
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
import { SYNC_QUOTES } from './components/owner-dashboard/syncQuotes';

function App() {
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showFinancialReport, setShowFinancialReport] = useState(false);
  const [showGstReports, setShowGstReports] = useState(false);
  const [showVatReports, setShowVatReports] = useState(false);

  const panic = useEmergencyPanicTrigger();

  const { tenantId, isAuthenticated, isLoading, checkAuth, role, isCloudSyncPaused } = useAuthStore();
  const profileReady = useStoreProfile(tenantId, isAuthenticated);
  useStartupReady(!isLoading && (!isAuthenticated || profileReady));
  const [restrictedActivePage, setRestrictedActivePage] = useState<string>('');
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
  useEffect(() => {
    const open = () => { if (featureFlagsRef.current?.restaurant_mode) setShowRestaurant(true); };
    window.addEventListener('open-restaurant', open);
    return () => window.removeEventListener('open-restaurant', open);
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
    enableScrapRef, featureFlagsRef, setRecycleBinCategory, setRestrictedActivePage, setScrapManagerInitialView, setShowAdsManager, setShowAiAssistant, setShowCashierSettlement, setShowComboManager, setShowCustomersPage, setShowEcommercePortal, setShowFinancialReport, setShowGstReports, setShowVatReports, setShowInventoryManager, setShowPartyManager, setShowPaymentsPage, setShowPurchaseBillManager, setShowQuotationManager, setShowRecycleBin, setShowReturnManager, setShowSalesHistory, setShowScrapManager, setShowSessionExpiredModal, setShowSettingsGrades, setShowSettingsManager, setShowSettingsPricingTiers, setShowStaffManager, setShowStockReport, setShowWarrantyManager,
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
        <PermissionGuard permission="restaurant.orders" onBack={() => setShowRestaurant(false)}>
          <RestaurantPage onClose={() => setShowRestaurant(false)} />
        </PermissionGuard>
      ) : showComboManager ? (
        <PermissionGuard permission="combos.view" onBack={() => setShowComboManager(false)}>
          <ComboManager onClose={() => setShowComboManager(false)} />
        </PermissionGuard>
      ) : showPartyManager ? (
        <PermissionGuard permission="customers.view" onBack={() => {
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
        <PermissionGuard permission="cash_register.view" onBack={() => setShowCashierSettlement(false)}>
          <CashierSettlement onClose={() => setShowCashierSettlement(false)} />
        </PermissionGuard>
      ) : showScrapManager ? (
        <PermissionGuard permission="scrap.view" onBack={() => setShowScrapManager(false)}>
          <ScrapManager onClose={() => { setShowScrapManager(false); setScrapManagerInitialView('list'); }} initialView={scrapManagerInitialView as import('./components/scrap/scrapTypes').View} />
        </PermissionGuard>
      ) : showQuotationManager ? (
        <PermissionGuard permission="quotations.view" onBack={() => setShowQuotationManager(false)}>
          <QuotationManager onClose={() => setShowQuotationManager(false)} />
        </PermissionGuard>
      ) : showReturnManager ? (
        <PermissionGuard permission="sales.refund" onBack={() => {
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
        <PermissionGuard permission="warranties.view" onBack={() => setShowWarrantyManager(false)}>
          <WarrantyManager onClose={() => setShowWarrantyManager(false)} />
        </PermissionGuard>
      ) : showPurchaseBillManager ? (
        <PermissionGuard permission="purchases.view" onBack={() => setShowPurchaseBillManager(false)}>
          <PurchaseBillManager onClose={() => setShowPurchaseBillManager(false)} />
        </PermissionGuard>
      ) : showCustomersPage ? (
        <PermissionGuard permission="customers.view" onBack={() => {
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
        <PermissionGuard permission="settings.view" onBack={() => setShowPaymentsPage(false)}>
          <PaymentMethods onClose={() => setShowPaymentsPage(false)} />
        </PermissionGuard>
      ) : showStaffManager ? (
        <PermissionGuard permission="users.view" onBack={() => setShowStaffManager(false)}>
          <StaffManager onClose={() => setShowStaffManager(false)} />
        </PermissionGuard>
      ) : showSettingsManager ? (
        <PermissionGuard permission="settings.view" onBack={() => setShowSettingsManager(false)}>
          <SettingsManager onClose={() => setShowSettingsManager(false)} />
        </PermissionGuard>
      ) : showSettingsGrades ? (
        <PermissionGuard permission="products.view" onBack={() => setShowSettingsGrades(false)}>
          <SettingsGrades onClose={() => setShowSettingsGrades(false)} />
        </PermissionGuard>
      ) : showSettingsPricingTiers ? (
        <PermissionGuard permission="combos.view" onBack={() => setShowSettingsPricingTiers(false)}>
          <PricingTiers onClose={() => setShowSettingsPricingTiers(false)} />
        </PermissionGuard>
      ) : showRecycleBin ? (
        <PermissionGuard permission="sales.view" onBack={() => setShowRecycleBin(false)}>
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
        <PermissionGuard permission="sales.view" onBack={() => setShowSalesHistory(false)}>
          <SalesHistory onClose={() => setShowSalesHistory(false)} />
        </PermissionGuard>
      ) : showInventoryManager ? (
        <PermissionGuard permission="products.view" onBack={() => setShowInventoryManager(false)}>
          <InventoryManager onClose={() => setShowInventoryManager(false)} />
        </PermissionGuard>
      ) : showStockReport ? (
        <PermissionGuard permission="reports.view" onBack={() => setShowStockReport(false)}>
          <StockReport onClose={() => setShowStockReport(false)} />
        </PermissionGuard>
      ) : showFinancialReport ? (
        <PermissionGuard permission="reports.financial" onBack={() => setShowFinancialReport(false)}>
          <FinancialReport onClose={() => setShowFinancialReport(false)} />
        </PermissionGuard>
      ) : showVatReports ? (
        <PermissionGuard permission="reports.view" onBack={() => setShowVatReports(false)}>
          <VatReportScreen onBack={() => setShowVatReports(false)} />
        </PermissionGuard>
      ) : showGstReports ? (
        <PermissionGuard permission="reports.view" onBack={() => setShowGstReports(false)}>
          <GstReportScreen onBack={() => setShowGstReports(false)} />
        </PermissionGuard>
      ) : showEcommercePortal ? (
        <PermissionGuard permission="products.view" onBack={() => setShowEcommercePortal(false)}>
          <EcommercePortal onClose={() => setShowEcommercePortal(false)} />
        </PermissionGuard>
      ) : showAdsManager ? (
        <AdsManager onClose={() => setShowAdsManager(false)} />
      ) : (showAiAssistant && isAiAssistantAvailable) ? (
        <AiAssistant onClose={() => setShowAiAssistant(false)} />
      ) : restrictedActivePage === 'BILLING' ? (
        <PermissionGuard permission="sales.create" onBack={() => setRestrictedActivePage('')}>
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
