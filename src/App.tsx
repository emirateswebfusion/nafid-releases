import { useEffect, useState } from 'react';
import { BillingPage } from './components/BillingPage';
import { DomainWizard } from './components/DomainWizard';
import { InventoryManager } from './components/InventoryManager';
import { SalesHistory } from './components/SalesHistory';
import { StaffManager } from './components/StaffManager';
import { SettingsManager } from './components/SettingsManager';
import { LoginScreen } from './components/LoginScreen';
import { OwnerDashboard } from './components/OwnerDashboard';
import { useCartStore } from './store/cartStore';
import { useAuthStore } from './store/authStore';

import { PartyManager } from './components/PartyManager';
import { PrintBarcodeView } from './components/PrintBarcodeView';
import { PrintReceiptView } from './components/PrintReceiptView';
import { PrintBulkBarcodeView } from './components/PrintBulkBarcodeView';
import { ScrapManager } from './components/ScrapManager';
import { QuotationManager } from './components/QuotationManager';
import { WarrantyManager } from './components/WarrantyManager';
import { PrintA4View } from './components/PrintA4View';
import { StockReport } from './components/StockReport';
import { DEFAULT_CODE_TYPE, type CodeType } from './labelCodeTypes';

function App() {
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

  const { currentUserRole, addItem } = useCartStore();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [showInventoryManager, setShowInventoryManager] = useState(false);
  const [showStockReport, setShowStockReport] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [showSettingsManager, setShowSettingsManager] = useState(false);
  const [showPartyManager, setShowPartyManager] = useState(false);
  const [showScrapManager, setShowScrapManager] = useState(false);
  const [showQuotationManager, setShowQuotationManager] = useState(false);
  const [showWarrantyManager, setShowWarrantyManager] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; label: string } | null>(null);

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
    { text: "Act now. There is never any time but now.", author: "Molière" },
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

  // Reset syncChecked when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setSyncChecked(false);
    }
  }, [isAuthenticated]);

  // Sync Logic (Run every time after auth or on app restart)
  useEffect(() => {
    if (isAuthenticated && !syncChecked && window.electronAPI) {
      const runSync = async () => {
        console.log('[App] System authenticated. Starting cloud pull...');
        setIsSyncing(true);
        setSyncProgress({ percent: 0, label: 'Connecting...' });
        try {
          await window.electronAPI.runInitialSync();
        } catch (error) {
          console.error('[App] Sync failed:', error);
        }
        setIsSyncing(false);
        setSyncProgress(null);
        setSyncChecked(true);
      };
      runSync();
    }
  }, [isAuthenticated, syncChecked]);

  // Simulated progress animation while syncing
  useEffect(() => {
    if (!isSyncing) return;
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        const p = prev?.percent ?? 0;
        const increment =
          p < 50 ? 15 :
          p < 65 ? 8 :
          p < 75 ? 4 :
          p < 85 ? 2 :
          p < 95 ? 1 :
          Math.max(1, Math.floor((100 - p) / 4));
        const next = Math.min(99, p + increment);
        return { percent: next, label: prev?.label ?? 'Synchronizing...' };
      });
    }, 300);
    return () => {
      clearInterval(interval);
      setSyncProgress({ percent: 100, label: 'Complete' });
    };
  }, [isSyncing]);

  // Rotate through shuffled quotes while syncing
  useEffect(() => {
    if (!isSyncing || shuffledQuotes.length === 0) return;
    const interval = setInterval(() => {
      setQuoteIndex(prev => {
        const next = prev + 1;
        if (next >= shuffledQuotes.length) {
          // Reshuffle after showing all
          setShuffledQuotes(shuffleArray(QUOTES.map((_, i) => i)));
          return 0;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isSyncing, shuffledQuotes]);

  useEffect(() => {
    const handleOpenInv = () => setShowInventoryManager(true);
    const handleOpenStockReport = () => setShowStockReport(true);
    const handleOpenHistory = () => setShowSalesHistory(true);
    const handleOpenStaff = () => setShowStaffManager(true);
    const handleOpenSettings = () => setShowSettingsManager(true);
    const handleOpenParties = () => setShowPartyManager(true);
    const handleOpenScrapManager = () => setShowScrapManager(true);
    const handleOpenQuotationManager = () => setShowQuotationManager(true);
    const handleOpenWarrantyManager = () => setShowWarrantyManager(true);
    const handleOpenQuotationEdit = () => {
      setShowQuotationManager(false);
      setShowInventoryManager(false);
      setShowStockReport(false);
      setShowSalesHistory(false);
      setShowStaffManager(false);
      setShowSettingsManager(false);
      setShowPartyManager(false);
      setShowScrapManager(false);
      setShowWarrantyManager(false);
    };

    window.addEventListener('open-inventory-manager', handleOpenInv);
    window.addEventListener('open-stock-report', handleOpenStockReport);
    window.addEventListener('open-sales-history', handleOpenHistory);
    window.addEventListener('open-staff-manager', handleOpenStaff);
    window.addEventListener('open-settings-manager', handleOpenSettings);
    window.addEventListener('open-parties-manager', handleOpenParties);
    window.addEventListener('open-scrap-manager', handleOpenScrapManager);
    window.addEventListener('open-quotation-manager', handleOpenQuotationManager);
    window.addEventListener('open-warranty-manager', handleOpenWarrantyManager);
    window.addEventListener('open-quotation-edit', handleOpenQuotationEdit);

    if (window.electronAPI) {
      window.electronAPI.onBarcodeScanned(async (code) => {
        const { tenantId } = useAuthStore.getState();
        const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId, barcode: code, limit: 1 });
        if (Array.isArray(products) && products.length > 0) {
          const match = products[0];
          addItem({
            product_id: match.product_id,
            name: match.name,
            base_price: match.base_price,
            purchase_price: match.purchase_price ?? 0,
            tax_rate_percent: match.tax_rate_percent ?? 0,
          });
          window.dispatchEvent(new CustomEvent('product-added', { detail: { product_id: match.product_id } }));
        }
      });

      window.electronAPI.onScaleWeight((weight) => {
        console.log(`Live Weight: ${weight}g`);
      });
    }

    return () => {
      window.removeEventListener('open-inventory-manager', handleOpenInv);
      window.removeEventListener('open-stock-report', handleOpenStockReport);
      window.removeEventListener('open-sales-history', handleOpenHistory);
      window.removeEventListener('open-staff-manager', handleOpenStaff);
      window.removeEventListener('open-settings-manager', handleOpenSettings);
      window.removeEventListener('open-parties-manager', handleOpenParties);
        window.removeEventListener('open-scrap-manager', handleOpenScrapManager);
      window.removeEventListener('open-quotation-manager', handleOpenQuotationManager);
      window.removeEventListener('open-warranty-manager', handleOpenWarrantyManager);
      window.removeEventListener('open-quotation-edit', handleOpenQuotationEdit);
    };
  }, [addItem]);

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

  if (isSyncing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background overflow-hidden relative">
        <div className="flex flex-col items-center gap-8 relative z-10 text-center px-6">
          <div>
            <h1 className="text-3xl font-black text-foreground mb-2 tracking-tight">Synchronizing Shop Data</h1>
            <div className="w-full max-w-sm space-y-2">
              <div className="w-full bg-primary/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${syncProgress?.percent ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {syncProgress?.label ?? 'Connecting...'} — {syncProgress?.percent ?? 0}%
              </p>
            </div>
            <div className="max-w-xs mt-6">
              <p className="text-sm text-muted-foreground/70 italic leading-relaxed animate-in fade-in duration-700">
                &ldquo;{QUOTES[shuffledQuotes[quoteIndex]]?.text ?? QUOTES[quoteIndex].text}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground/50 mt-2 animate-in fade-in duration-700">
                — {QUOTES[shuffledQuotes[quoteIndex]]?.author ?? QUOTES[quoteIndex].author}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Starting Vendora...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground select-none">
      {currentUserRole === 'OWNER' && <DomainWizard />}
      {showStaffManager && <StaffManager onClose={() => setShowStaffManager(false)} />}
      {showPartyManager && <PartyManager onClose={() => setShowPartyManager(false)} />}

      {showScrapManager ? (
        <ScrapManager onClose={() => setShowScrapManager(false)} />
      ) : showQuotationManager ? (
        <QuotationManager onClose={() => setShowQuotationManager(false)} />
      ) : showWarrantyManager ? (
        <WarrantyManager onClose={() => setShowWarrantyManager(false)} />
      ) : showSettingsManager ? (
        <SettingsManager onClose={() => setShowSettingsManager(false)} />
      ) : showSalesHistory ? (
        <SalesHistory onClose={() => setShowSalesHistory(false)} />
      ) : showInventoryManager ? (
        <InventoryManager onClose={() => setShowInventoryManager(false)} />
      ) : showStockReport ? (
        <StockReport onClose={() => setShowStockReport(false)} />
      ) : currentUserRole === 'OWNER' ? (
        <OwnerDashboard />
      ) : (
        <BillingPage />
      )}
    </div>
  );
}

export default App;
