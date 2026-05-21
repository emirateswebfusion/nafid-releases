import { useEffect, useState } from 'react';
import { CartPane } from './components/CartPane';
import { ActionPane } from './components/ActionPane';
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

function App() {
  const [printBarcodeData, setPrintBarcodeData] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash.startsWith('#/print-barcode')) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
      setPrintBarcodeData(urlParams.get('barcode'));
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

  // Initial Sync Logic (Run once after auth if DB is empty)
  useEffect(() => {
    if (isAuthenticated && !syncChecked && window.electronAPI) {
      const runSync = async () => {
        const { tenantId } = useAuthStore.getState();
        const result = await window.electronAPI.dbGetProducts(tenantId || '');
        console.log('[App] Initial Product Check:', result);
        
        if (Array.isArray(result) && result.length === 0) {
          console.log('[App] New system detected. Starting initial cloud pull...');
          setIsSyncing(true);
          await window.electronAPI.runInitialSync();
          setIsSyncing(false);
        } else if (result && 'error' in result) {
          console.error('[App] Database error on startup:', result.error);
        }
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
        const products = await window.electronAPI.dbGetProducts(tenantId || '');
        if (Array.isArray(products)) {
          const match = products.find((p: any) => p.sku_barcode === code);
          if (match) {
            addItem({
              product_id: match.product_id,
              name: match.name,
              base_price: match.base_price,
              purchase_price: match.purchase_price ?? 0,
              tax_rate_percent: match.tax_rate_percent ?? 0,
            });
          }
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
    return <PrintBarcodeView barcode={printBarcodeData} />;
  }

  if (isSyncing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent opacity-50" />
        <div className="flex flex-col items-center gap-8 relative z-10 text-center px-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 w-24 h-24 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-blue-500 rounded-full animate-pulse opacity-50" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Synchronizing Shop Data</h1>
            <p className="text-neutral-500 max-w-sm leading-relaxed">
              We're pulling your latest products, inventory, and sales history from the cloud.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Starting Vendora...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 font-sans text-white select-none">
      {currentUserRole === 'OWNER' && <DomainWizard />}
      {showInventoryManager && <InventoryManager onClose={() => setShowInventoryManager(false)} />}
      {showSalesHistory && <SalesHistory onClose={() => setShowSalesHistory(false)} />}
      {showStaffManager && <StaffManager onClose={() => setShowStaffManager(false)} />}
      {showSettingsManager && <SettingsManager onClose={() => setShowSettingsManager(false)} />}

      {currentUserRole === 'OWNER' ? (
        <OwnerDashboard />
      ) : (
        <>
          <CartPane />
          <ActionPane />
        </>
      )}
    </div>
  );
}

export default App;
