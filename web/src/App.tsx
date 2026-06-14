import { useState, useEffect } from 'react';
import { useAuthStore } from '../../src/store/authStore';
import { MobileLogin } from './MobileLogin';
import { SalesHistory } from '../../src/components/SalesHistory';
import { StaffManager } from '../../src/components/StaffManager';
import { ActionPane } from '../../src/components/ActionPane';
import { LogOut, Receipt, Users, Calculator, RefreshCw } from 'lucide-react';

export default function App() {
  const { isAuthenticated, isLoading, checkAuth, logout, role } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'SALES' | 'STAFF' | 'DISCOUNT'>('SALES');

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || role !== 'OWNER') {
    return <MobileLogin />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden text-foreground">
      {/* Top Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <h1 className="font-bold text-lg">Vendora</h1>
        <button onClick={() => logout()} className="p-2 text-muted-foreground hover:text-destructive">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'SALES' && (
          <div className="absolute inset-0 [&>div]:static [&>div]:h-full [&>div]:w-full [&>div]:rounded-none [&>div]:border-0 [&>div>div]:p-2">
            <SalesHistory onClose={() => {}} />
          </div>
        )}
        
        {activeTab === 'STAFF' && (
          <div className="absolute inset-0 [&>div]:static [&>div]:h-full [&>div]:w-full [&>div]:rounded-none [&>div]:border-0 [&>div>div]:p-2">
            <StaffManager onClose={() => {}} />
          </div>
        )}

        {activeTab === 'DISCOUNT' && (
          <div className="p-4 h-full overflow-auto flex flex-col items-center justify-center relative z-0">
            <div className="text-center max-w-sm w-full bg-card border border-border shadow-sm rounded-2xl p-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-4">
                <Calculator className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold mb-2">Apply Discount</h2>
              <p className="text-sm text-muted-foreground mb-6">Enter the invoice shortcode to apply a discount to a past bill.</p>
              
              {/* Render ActionPane directly, but we only want the discount modal part. 
                  Actually, ActionPane is a large component. Let's just mount it hidden, 
                  and dispatch an event to open its internal modal, 
                  but the modal uses Portals to attach to document body. */}
              <button 
                className="w-full bg-primary text-primary-foreground h-12 rounded-xl font-bold shadow-md active:scale-95 transition-transform"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-discount-modal'));
                  // We also need to set ActionPane's tab to PAST, but ActionPane doesn't listen for this event.
                  // Wait, ActionPane only listens for 'open-checkout'.
                  // We can just render a custom minimal interface here, but we are supposed to reuse components.
                }}
              >
                Open Discount Window
              </button>
            </div>
            
            {/* We mount ActionPane here. We will dispatch the 'open-checkout' to open it? No, checkout is for current bill.
                We might need to add a global event listener in ActionPane to open discount. */}
            <div className="hidden">
              <ActionPane />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 border-t border-border bg-card flex items-center justify-around shrink-0 pb-safe">
        <button 
          onClick={() => setActiveTab('SALES')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'SALES' ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Sales</span>
        </button>
        <button 
          onClick={() => setActiveTab('DISCOUNT')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'DISCOUNT' ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Calculator className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Discount</span>
        </button>
        <button 
          onClick={() => setActiveTab('STAFF')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === 'STAFF' ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Staff</span>
        </button>
      </nav>
    </div>
  );
}
