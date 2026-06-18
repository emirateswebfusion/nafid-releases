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

import { PrintBarcodeView } from './components/PrintBarcodeView';
import { PrintReceiptView } from './components/PrintReceiptView';
import { PrintBulkBarcodeView } from './components/PrintBulkBarcodeView';

function App() {
  const [printBarcodeData, setPrintBarcodeData] = useState<string | null>(null);
  const [printBarcodePrice, setPrintBarcodePrice] = useState<string | null>(null);
  const [printBarcodeSp, setPrintBarcodeSp] = useState<string | null>(null);
  const [printBarcodeSpType, setPrintBarcodeSpType] = useState<string | null>(null);
  const [printBarcodeName, setPrintBarcodeName] = useState<string | null>(null);
  const [printBarcodeQuantity, setPrintBarcodeQuantity] = useState<number>(1);
  const [printBarcodeColumns, setPrintBarcodeColumns] = useState<number>(1);
  const [printReceiptData, setPrintReceiptData] = useState<string | null>(null);
  const [showPrintBulkBarcode, setShowPrintBulkBarcode] = useState(false);

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
    } else if (window.location.hash.startsWith('#/print-receipt')) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
      setPrintReceiptData(urlParams.get('text'));
    } else if (window.location.hash.startsWith('#/print-bulk-barcode')) {
      setShowPrintBulkBarcode(true);
    }
  }, []);

  const { currentUserRole, addItem } = useCartStore();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [showInventoryManager, setShowInventoryManager] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [showStaffManager, setShowStaffManager] = useState(false);
  const [showSettingsManager, setShowSettingsManager] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncChecked, setSyncChecked] = useState(false);

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
        try {
          await window.electronAPI.runInitialSync();
        } catch (error) {
          console.error('[App] Sync failed:', error);
        }
        setIsSyncing(false);
        setSyncChecked(true);
      };
      runSync();
    }
  }, [isAuthenticated, syncChecked]);

  useEffect(() => {
    const handleOpenInv = () => setShowInventoryManager(true);
    const handleOpenHistory = () => setShowSalesHistory(true);
    const handleOpenStaff = () => setShowStaffManager(true);
    const handleOpenSettings = () => setShowSettingsManager(true);
    
    window.addEventListener('open-inventory-manager', handleOpenInv);
    window.addEventListener('open-sales-history', handleOpenHistory);
    window.addEventListener('open-staff-manager', handleOpenStaff);
    window.addEventListener('open-settings-manager', handleOpenSettings);

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
      window.removeEventListener('open-sales-history', handleOpenHistory);
      window.removeEventListener('open-staff-manager', handleOpenStaff);
      window.removeEventListener('open-settings-manager', handleOpenSettings);
    };
  }, [addItem]);

  if (printBarcodeData) {
    return <PrintBarcodeView barcode={printBarcodeData} price={printBarcodePrice ? parseFloat(printBarcodePrice) : undefined} sp={printBarcodeSp ? parseFloat(printBarcodeSp) : undefined} spType={printBarcodeSpType as 'SP' | 'OFF' | undefined} name={printBarcodeName || undefined} quantity={printBarcodeQuantity} columns={printBarcodeColumns} />;
  }

  if (printReceiptData) {
    return <PrintReceiptView text={printReceiptData} />;
  }

  if (showPrintBulkBarcode) {
    return <PrintBulkBarcodeView />;
  }

  if (isSyncing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background overflow-hidden relative">
        <div className="flex flex-col items-center gap-8 relative z-10 text-center px-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-primary rounded-full animate-pulse opacity-50" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground mb-2 tracking-tight">Synchronizing Shop Data</h1>
            <p className="text-muted-foreground max-w-sm leading-relaxed">
              We're pulling your latest products, inventory, and sales history from the cloud.
            </p>
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
      {showInventoryManager && <InventoryManager onClose={() => setShowInventoryManager(false)} />}
      {showStaffManager && <StaffManager onClose={() => setShowStaffManager(false)} />}

      {showSettingsManager ? (
        <SettingsManager onClose={() => setShowSettingsManager(false)} />
      ) : showSalesHistory ? (
        <SalesHistory onClose={() => setShowSalesHistory(false)} />
      ) : currentUserRole === 'OWNER' ? (
        <OwnerDashboard />
      ) : (
        <BillingPage />
      )}
    </div>
  );
}

export default App;
