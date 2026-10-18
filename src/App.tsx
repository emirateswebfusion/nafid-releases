import { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import UpdateBanner from './components/UpdateBanner';
import { PermissionGuard } from './components/PermissionGuard';
import { BillingPage } from './components/BillingPage';
import { ComboManager } from './components/ComboManager';
import { InventoryManager } from './components/InventoryManager';
import { SalesHistory } from './components/SalesHistory';
import { StaffManager } from './components/StaffManager';
import { SettingsManager } from './components/SettingsManager';
import { SettingsGrades } from './components/SettingsGrades';
import { PricingTiers } from './components/PricingTiers';
import { LoginScreen } from './components/LoginScreen';
import { OwnerDashboard } from './components/OwnerDashboard';
import SuperDashboard from './components/SuperDashboard';
import { useCartStore } from './store/cartStore';
import { useTabStore, type TabSnapshot, saveStoredTabs } from './store/tabStore';
import { useAuthStore } from './store/authStore';
import { useScaleStore } from './store/scaleStore';
import { setAppTimeFormat } from './utils/receiptGenerator';
import { isAdminRole } from './utils/permissions';
import { setStoreTimezone } from './utils/timezoneHelper';
import { PartyManager } from './components/PartyManager';
import { CashierSettlement } from './components/CashierSettlement';
import { PaymentMethods } from './components/PaymentMethods';
import { PrintBarcodeView } from './components/PrintBarcodeView';
import { PrintReceiptView } from './components/PrintReceiptView';
import { PrintBulkBarcodeView } from './components/PrintBulkBarcodeView';
import { ScrapManager } from './components/ScrapManager';
import { QuotationManager } from './components/QuotationManager';
import { WarrantyManager } from './components/WarrantyManager';
import { ReturnManager } from './components/ReturnManager';
import { PrintA4View } from './components/PrintA4View';
import { StockReport } from './components/StockReport';
import { FinancialReport } from './components/FinancialReport';
import { PurchaseBillManager } from './components/PurchaseBillManager';
import { CustomersPage } from './components/CustomersPage';
import { SessionExpiredModal } from './components/SessionExpiredModal';
import { DEFAULT_CODE_TYPE, type CodeType } from './labelCodeTypes';
import { useFeatureFlagsStore, isAiAssistantAvailable, type FeatureKey } from './featureFlags';
import { SplashScreen } from './components/SplashScreen';
import { AiAssistant } from './components/AiAssistant';
import { EcommercePortal } from './components/EcommercePortal';
import { AdsManager } from './components/AdsManager';
import { useEmergencyPanicTrigger } from './hooks/useEmergencyPanicTrigger';

function App() {
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showFinancialReport, setShowFinancialReport] = useState(false);
  const [printBarcodeData, setPrintBarcodeData] = useState<string | null>(null);
  const [printBarcodePrice, setPrintBarcodePrice] = useState<string | null>(null);
  const [printBarcodeSp, setPrintBarcodeSp] = useState<string | null>(null);
  const [printBarcodeSpType, setPrintBarcodeSpType] = useState<string | null>(null);
  const [printBarcodeName, setPrintBarcodeName] = useState<string | null>(null);
  const [printBarcodeQuantity, setPrintBarcodeQuantity] = useState<number>(1);
  const [printBarcodeColumns, setPrintBarcodeColumns] = useState<number>(1);
  const [printBarcodeCodeType, setPrintBarcodeCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [printBulkCodeType, setPrintBulkCodeType] = useState<CodeType>(DEFAULT_CODE_TYPE);
  const [printReceiptData, setPrintReceiptData] = useState<string | null>(null);
  const [showPrintBulkBarcode, setShowPrintBulkBarcode] = useState(false);
  const [showPrintA4, setShowPrintA4] = useState(false);

  const {
    showPinPrompt,
    setShowPinPrompt,
    enteredPin,
    setEnteredPin,
    pinError,
    handlePinSubmit,
    isPurging
  } = useEmergencyPanicTrigger();

  useEffect(() => {
    if (window.location.hash.startsWith('#/print-barcode')) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
      setPrintBarcodeData(urlParams.get('barcode'));
      
      const paramPrice = urlParams.get('price');
      setPrintBarcodePrice(paramPrice !== null ? paramPrice : localStorage.getItem('printBarcodePrice'));
      
      const paramSp = urlParams.get('sp');
      setPrintBarcodeSp(paramSp !== null ? paramSp : localStorage.getItem('printBarcodeSp'));

      const paramSpType = urlParams.get('spType');
      setPrintBarcodeSpType(paramSpType !== null ? paramSpType : localStorage.getItem('printBarcodeSpType'));
      
      const paramName = urlParams.get('name');
      setPrintBarcodeName(paramName !== null ? paramName : localStorage.getItem('printBarcodeName'));

      const paramQty = urlParams.get('quantity');
      setPrintBarcodeQuantity(paramQty !== null ? parseInt(paramQty, 10) : 1);

      const paramCols = urlParams.get('columns');
      setPrintBarcodeColumns(paramCols !== null ? parseInt(paramCols, 10) : 1);
      const paramCodeType = urlParams.get('codeType');
      if (paramCodeType === 'barcode' || paramCodeType === 'qrcode') setPrintBarcodeCodeType(paramCodeType);
      else setPrintBarcodeCodeType(DEFAULT_CODE_TYPE);
    } else if (window.location.hash.startsWith('#/print-receipt')) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
      setPrintReceiptData(urlParams.get('text') || ''); // '' triggers IPC fallback in PrintReceiptView
    } else if (window.location.hash.startsWith('#/print-bulk-barcode')) {
      setShowPrintBulkBarcode(true);
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
      const bulkCodeType = urlParams.get('codeType');
      if (bulkCodeType === 'barcode' || bulkCodeType === 'qrcode') setPrintBulkCodeType(bulkCodeType);
      else setPrintBulkCodeType(DEFAULT_CODE_TYPE);
    } else if (window.location.hash.startsWith('#/print-a4')) {
      setShowPrintA4(true);
    }
  }, []);

  const { currentUserRole } = useCartStore();
  const { isAuthenticated, isLoading, checkAuth, restrictedPage, shopName, logout, role, isCloudSyncPaused } = useAuthStore();
  const [restrictedActivePage, setRestrictedActivePage] = useState<string>('');
  const [showInventoryManager, setShowInventoryManager] = useState(false);
  const [showComboManager, setShowComboManager] = useState(false);
  const [showStockReport, setShowStockReport] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
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
  enableScrapRef.current = enableScrap;
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
  const featureFlagsRef = useRef(featureFlags);
  featureFlagsRef.current = featureFlags;
  const [showQuotationManager, setShowQuotationManager] = useState(false);
  const [showWarrantyManager, setShowWarrantyManager] = useState(false);
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; label: string; recordsSynced: number; totalRecords: number } | null>(null);
  const [syncComplete, setSyncComplete] = useState(false);

  const QUOTES = [
    { text: "The best among you are those who bring benefit to others.", author: "Muhammad (SAW)" },
    { text: "Take advantage of five before five: your youth before your old age, your health before your sickness, your wealth before your poverty, your free time before your preoccupation, and your life before your death.", author: "Muhammad (SAW)" },
    { text: "Verily, with hardship comes ease.", author: "Muhammad (SAW)" },
    { text: "A good word is charity.", author: "Muhammad (SAW)" },
    { text: "The strong person is not the one who can overpower others, but the one who controls themselves in times of anger.", author: "Muhammad (SAW)" },
    { text: "Whoever does not thank people, does not thank Allah.", author: "Muhammad (SAW)" },
    { text: "The best of you is the one who is best to his family.", author: "Muhammad (SAW)" },
    { text: "Make things easy, do not make things difficult.", author: "Muhammad (SAW)" },
    { text: "If you have no shame, do whatever you please.", author: "Muhammad (SAW)" },
    { text: "A person will be with those whom they love.", author: "Muhammad (SAW)" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
    { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
    { text: "What you get by achieving your goals is not as important as what you become.", author: "Zig Ziglar" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "Your attitude, not your aptitude, will determine your altitude.", author: "Zig Ziglar" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
    { text: "A year from now you may wish you had started today.", author: "Karen Lamb" },
    { text: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James" },
    { text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
    { text: "The harder you work, the luckier you get.", author: "Gary Player" },
    { text: "It always seems impossible until it is done.", author: "Nelson Mandela" },
    { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
    { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
    { text: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
    { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
    { text: "Dream big and dare to fail.", author: "Norman Vaughan" },
    { text: "Act now. There is never any time but now.", author: "MoliÃ¨re" },
    { text: "The best revenge is massive success.", author: "Frank Sinatra" },
    { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
    { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
    { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "If opportunity doesn't knock, build a door.", author: "Milton Berle" },
    { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
    { text: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
    { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
    { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  ];

  const [shuffledQuotes, setShuffledQuotes] = useState<number[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Fisher-Yates shuffle
  function shuffleArray(arr: number[]): number[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pre-shuffle all quotes when syncing starts
  useEffect(() => {
    if (isSyncing) {
      setShuffledQuotes(shuffleArray(QUOTES.map((_, i) => i)));
      setQuoteIndex(0);
    }
  }, [isSyncing]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // If running in browser dev mode and a pathname like /login is entered, clean it up
    if (!window.electronAPI && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Reset syncChecked and sync state when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setSyncChecked(false);
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncComplete(false);
    }
  }, [isAuthenticated]);

  // Auto-hide sync complete bar after 4 seconds
  useEffect(() => {
    if (!syncComplete) return;
    const timer = setTimeout(() => {
      setSyncComplete(false);
      setSyncProgress(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [syncComplete]);

  // Trigger initial sync once on first login — progress events will activate the bar
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#/print')) return;
    if (isAuthenticated && !isCloudSyncPaused && !syncChecked && window.electronAPI) {
      console.log('[App] System authenticated. Starting cloud sync in background...');
      window.electronAPI.runInitialSync().then(() => {
        console.log('[App] Initial sync completed.');
      }).catch((error) => {
        console.error('[App] Sync failed:', error);
      });
      setSyncChecked(true);
    }
  }, [isAuthenticated, isCloudSyncPaused, syncChecked]);

  // Listen to real sync progress from electron — handles ALL syncs (initial + periodic)
  useEffect(() => {
    if (!window.electronAPI?.onSyncProgress) return;
    const cleanup = window.electronAPI.onSyncProgress((progress) => {
      setSyncProgress({
        percent: progress.percent ?? 0,
        label: progress.label ?? 'Syncing...',
        recordsSynced: progress.recordsSynced ?? 0,
        totalRecords: progress.totalRecords ?? 0,
      });
      setIsSyncing(true);
      setSyncComplete(false);
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  // Listen to sync cycle complete to mark sync as done
  useEffect(() => {
    if (!window.electronAPI?.onSyncCycleComplete) return;
    const _cleanup = window.electronAPI.onSyncCycleComplete(() => {
      setSyncComplete(true);
      setIsSyncing(false);
    });
    return () => { /* cleanup is handled by IPC subscription */ };
  }, []);

  // Rotate through shuffled quotes while syncing
  useEffect(() => {
    if (!isSyncing || shuffledQuotes.length === 0) return;
    const interval = setInterval(() => {
      setQuoteIndex(prev => {
        const next = prev + 1;
        if (next >= shuffledQuotes.length) {
          setShuffledQuotes(shuffleArray(QUOTES.map((_, i) => i)));
          return 0;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isSyncing, shuffledQuotes]);

  useEffect(() => {
    if (!window.electronAPI || !isAuthenticated) return;
    const tid = useAuthStore.getState().tenantId;
    window.electronAPI.settingsGet({ tenant_id: tid || 'global', key: 'enable_scrap' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
    loadFlags(tid || 'global');
    window.electronAPI.settingsGet({ tenant_id: tid || 'global', key: 'time_format' }).then((v: any) => {
      if (v === '24h' || v === '12h') {
        setAppTimeFormat(v);
      } else {
        setAppTimeFormat('12h');
      }
    });
    window.electronAPI.settingsGet({ tenant_id: tid || 'global', key: 'store_timezone' }).then((v: any) => {
      if (v) setStoreTimezone(v);
    });

    const handleSettingsUpdated = () => {
      const currentTid = useAuthStore.getState().tenantId;
      loadFlags(currentTid || 'global');
      window.electronAPI.settingsGet({ tenant_id: currentTid || 'global', key: 'enable_scrap' }).then((v: any) => {
        if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
      });
      window.electronAPI.settingsGet({ tenant_id: currentTid || 'global', key: 'time_format' }).then((v: any) => {
        if (v === '24h' || v === '12h') setAppTimeFormat(v);
      });
      window.electronAPI.settingsGet({ tenant_id: currentTid || 'global', key: 'store_timezone' }).then((v: any) => {
        if (v) setStoreTimezone(v);
      });
    };
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('settings:updated', handleSettingsUpdated);
    };
  }, [isAuthenticated, loadFlags]);

  useEffect(() => {
    const canOpen = (key: FeatureKey) => {
      if (key === 'ai_assistant') {
        return isAiAssistantAvailable && (featureFlagsRef.current ? featureFlagsRef.current.ai_assistant !== false : true);
      }
      return Boolean(featureFlagsRef.current?.[key]);
    };
    const handleOpenInv = () => { if (canOpen('inventory')) setShowInventoryManager(true); };
    const handleOpenStockReport = () => { if (canOpen('stock_report')) setShowStockReport(true); };
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
      setShowStockReport(false);
      setShowSalesHistory(false);
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
      setShowStockReport(false);
      setShowSalesHistory(false);
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
      setShowInventoryManager(false);
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
      setShowInventoryManager(false);
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
      setShowInventoryManager(false);
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
      setShowStockReport(false);
      setShowSalesHistory(false);
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
      setShowStockReport(false);
      setShowSalesHistory(false);
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

    const handleOpenComboManager = () => setShowComboManager(true);
    const handleOpenAdsManager = () => setShowAdsManager(true);
    const handleOpenFinancialReport = () => setShowFinancialReport(true);
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
    window.addEventListener('open-sales-history', handleOpenHistory);
    window.addEventListener('open-staff-manager', handleOpenStaff);
    window.addEventListener('open-settings-manager', handleOpenSettings);
    window.addEventListener('open-settings-grades', handleOpenSettingsGrades);
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
    if (window.electronAPI) {
      const unsub = window.electronAPI.onTokenExpired?.(() => {
        console.warn('[App] Cloud session expired or unauthorized. Showing session expired modal...');
        setShowSessionExpiredModal(true);
      });
      if (typeof unsub === 'function') {
        unsubscribeTokenExpired = unsub;
      }

      unsubscribeScale = window.electronAPI.onScaleWeight((weight) => {
        useScaleStore.getState().setLiveWeight(weight);
      });
    }

    const handleOpenSessionExpiredModal = () => setShowSessionExpiredModal(true);
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
      window.removeEventListener('open-stock-report', handleOpenStockReport);
      window.removeEventListener('open-sales-history', handleOpenHistory);
      window.removeEventListener('open-staff-manager', handleOpenStaff);
      window.removeEventListener('open-settings-manager', handleOpenSettings);
      window.removeEventListener('open-settings-grades', handleOpenSettingsGrades);
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

  if (printBarcodeData) {
    return <PrintBarcodeView barcode={printBarcodeData} price={printBarcodePrice ? parseFloat(printBarcodePrice) : undefined} sp={printBarcodeSp ? parseFloat(printBarcodeSp) : undefined} spType={printBarcodeSpType as 'SP' | 'OFF' | undefined} name={printBarcodeName || undefined} quantity={printBarcodeQuantity} columns={printBarcodeColumns} codeType={printBarcodeCodeType} />;
  }

  if (printReceiptData !== null) {
    return <PrintReceiptView text={printReceiptData} />;
  }

  if (showPrintBulkBarcode) {
    return <PrintBulkBarcodeView codeType={printBulkCodeType} />;
  }

  if (showPrintA4) {
    return <PrintA4View />;
  }

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (role === 'SUPER_ADMIN') {
    return <SuperDashboard />;
  }


  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      <div className="absolute top-0 left-0 right-0 z-50">
        <UpdateBanner onOpenSettings={() => setShowSettingsManager(true)} />
      </div>

      {showComboManager ? (
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
          <ScrapManager onClose={() => { setShowScrapManager(false); setScrapManagerInitialView('list'); }} initialView={scrapManagerInitialView as any} />
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
          QUOTES={QUOTES}
        />
      )}
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

      {/* Emergency Panic Quick PIN Verification Modal */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <form onSubmit={handlePinSubmit} className="bg-card p-6 rounded-2xl border border-border shadow-2xl max-w-xs w-full space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-foreground">Security Verification</h3>
              <p className="text-xs text-muted-foreground">Enter security code to continue</p>
            </div>
            <input
              type="password"
              autoFocus
              maxLength={4}
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className={clsx(
                "w-full h-11 text-center text-lg tracking-[0.5em] font-mono rounded-xl border bg-background outline-hidden transition-all",
                pinError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-border focus:border-primary"
              )}
            />
            {pinError && <p className="text-[11px] text-rose-500 text-center font-medium">Invalid security code</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPinPrompt(false)}
                className="flex-1 h-9 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Emergency Purging Overlay */}
      {isPurging && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            <p className="text-xs font-mono text-muted-foreground">Resetting local system...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
