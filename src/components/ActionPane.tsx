import { useState } from 'react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CreditCard, Tag, FileText, Settings, XCircle, LogOut, Store, Receipt, Users } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

export function ActionPane() {
  const { items, invoiceType, setInvoiceType, clearCart, setDiscount, currentUserRole, setRole } = useCartStore();
  const { shopName, role: authRole, tenantId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;

    if (window.electronAPI) {
      // Build the checkout payload
      const invoice_id = uuidv4();
      const invoice_number = `INV-${Date.now()}`;

      const lineItems = items.map((item) => {
        const taxAmount = invoiceType === 'GST'
          ? item.base_price * item.quantity * (item.tax_rate_percent / 100)
          : 0;
        return {
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.base_price,
          tax_amount: taxAmount,
          total: item.base_price * item.quantity + taxAmount,
        };
      });

      setIsCheckingOut(true);
      setHardwareError(null);

      // Atomically: create invoice + insert items + deduct stock
      const result = await window.electronAPI.dbCheckout({
        invoice_id,
        tenant_id: tenantId || 'unset',
        user_id: useAuthStore.getState().userId || 'unset',
        invoice_number,
        invoice_type: invoiceType,
        subtotal,
        tax_total: totalTax,
        discount_total: discount,
        grand_total: grandTotal,
        items: lineItems,
      });

      if (!result.success) {
        alert('Checkout failed: ' + result.error);
        setIsCheckingOut(false);
        return;
      }

      // Print receipt and open cash drawer
      try {
        const printResult = await window.electronAPI.printReceipt(tenantId || 'global', `INVOICE ${invoice_number}\nTOTAL: ₹${grandTotal.toFixed(2)}`);
        const drawerResult = await window.electronAPI.openCashDrawer(tenantId || 'global');
        
        if (!printResult.success || !drawerResult.success) {
          setHardwareError(`Hardware connection issue: ${printResult.error || drawerResult.error || 'Check printer'}`);
        }
      } catch (e) {
        setHardwareError('Communication error with hardware services.');
      }
    }

    clearCart();
    setIsCheckingOut(false);
  };

  useKeyboardShortcuts({
    'F8': () => {
      const val = prompt('Enter discount amount:');
      if (val) setDiscount(parseFloat(val));
    },
    'F12': handleCheckout
  });

  return (
    <div className="flex flex-col h-full w-[40%] bg-neutral-900 shadow-xl z-10 relative">
      {/* Top Bar */}
      <div className="flex p-3 gap-2 justify-between items-center border-b border-neutral-800">
        {/* Shop name */}
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-neutral-500 shrink-0" />
          <span className="text-sm font-semibold text-neutral-300 truncate">{shopName || 'My Shop'}</span>
          {authRole && (
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', authRole === 'OWNER' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400')}>
              {authRole}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Role toggle (in-session switch) - Only visible to authenticated Owners */}
          {authRole === 'OWNER' && (
            <div className="flex items-center gap-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
              <button
                onClick={() => setRole('CASHIER')}
                className={clsx('px-2 py-1 text-[10px] font-bold rounded transition-colors', currentUserRole === 'CASHIER' ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-neutral-300')}
              >
                CASHIER
              </button>
              <button
                onClick={() => setRole('OWNER')}
                className={clsx('px-2 py-1 text-[10px] font-bold rounded transition-colors', currentUserRole === 'OWNER' ? 'bg-purple-600 text-white' : 'text-neutral-500 hover:text-neutral-300')}
              >
                OWNER
              </button>
            </div>
          )}

          {currentUserRole === 'OWNER' && (
            <>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-inventory-manager'))}
                className="p-1.5 text-neutral-500 hover:text-blue-400 hover:bg-neutral-800 rounded-lg transition-colors"
                title="Manage Inventory"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-staff-manager'))}
                className="p-1.5 text-neutral-500 hover:text-purple-400 hover:bg-neutral-800 rounded-lg transition-colors"
                title="Staff Management"
              >
                <Users className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-sales-history'))}
            className="p-1.5 text-neutral-500 hover:text-emerald-400 hover:bg-neutral-800 rounded-lg transition-colors"
            title="Sales History"
          >
            <Receipt className="w-4 h-4" />
          </button>
          <button onClick={clearCart} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors" title="Clear Cart">
            <XCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => useAuthStore.getState().logout()}
            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
            className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Invoice Type Toggle */}
      <div className="p-6">
        <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
          <button
            onClick={() => setInvoiceType('GST')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300",
              invoiceType === 'GST' 
                ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]" 
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            GST Tax Invoice
          </button>
          <button
            onClick={() => setInvoiceType('BILL_OF_SUPPLY')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300",
              invoiceType === 'BILL_OF_SUPPLY' 
                ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.3)]" 
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            Bill of Supply
          </button>
        </div>
      </div>

      <div className="flex-1"></div>

      {/* Totals Section */}
      <div className="px-6 py-4 space-y-4">
        <div className="flex justify-between text-neutral-400 font-medium">
          <span>Subtotal</span>
          <span className="text-neutral-200">₹{subtotal.toFixed(2)}</span>
        </div>

        {invoiceType === 'GST' && (
          <div className="space-y-2 border-y border-neutral-800/50 py-3 my-2">
            {igst > 0 ? (
              <div className="flex justify-between text-sm text-neutral-500">
                <span>IGST</span>
                <span>₹{igst.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm text-neutral-500">
                  <span>CGST</span>
                  <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-neutral-500">
                  <span>SGST</span>
                  <span>₹{sgst.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm font-semibold text-blue-400/80 pt-1">
              <span>Total Tax</span>
              <span>₹{totalTax.toFixed(2)}</span>
            </div>
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-emerald-400 font-medium">
            <span>Discount</span>
            <span>-₹{discount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-end pt-4">
          <span className="text-xl font-bold text-neutral-300">Grand Total</span>
          <span className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            ₹{grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Hardware Error Notification */}
      {hardwareError && (
        <div className="mx-6 mb-4 p-3 bg-amber-500/10 border border-amber-500/50 rounded-xl flex items-center gap-3 text-amber-500 animate-in fade-in slide-in-from-top-2">
          <Settings className="w-5 h-5 animate-pulse" />
          <p className="text-sm font-bold flex-1">{hardwareError}</p>
          <button onClick={() => setHardwareError(null)} className="ml-auto hover:bg-amber-500/20 p-1 rounded-lg">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-6 grid grid-cols-2 gap-4">
        <button 
          onClick={() => {
            const val = prompt('Enter discount amount:');
            if (val) setDiscount(parseFloat(val));
          }}
          className="col-span-1 flex flex-col items-center justify-center gap-2 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-all border border-neutral-700/50"
        >
          <Tag className="w-5 h-5" />
          <span className="font-semibold text-sm">Discount</span>
          <span className="text-[10px] text-neutral-500 font-mono">[F8]</span>
        </button>

        <button 
          className="col-span-1 flex flex-col items-center justify-center gap-2 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-all border border-neutral-700/50"
        >
          <FileText className="w-5 h-5" />
          <span className="font-semibold text-sm">Hold Bill</span>
          <span className="text-[10px] text-neutral-500 font-mono">[F9]</span>
        </button>

        <button 
          onClick={handleCheckout}
          disabled={isCheckingOut || items.length === 0}
          className={clsx(
            "col-span-2 flex items-center justify-center gap-3 py-5 transition-all active:scale-[0.98] font-bold text-lg border border-white/10 rounded-xl",
            (isCheckingOut || items.length === 0)
              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white shadow-[0_10px_30px_rgba(5,150,105,0.2)] hover:shadow-[0_10px_40px_rgba(5,150,105,0.4)]"
          )}
        >
          {isCheckingOut ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>PROCESSING...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-6 h-6" />
              <span>CHECKOUT / PRINT</span>
              <span className="ml-2 px-2 py-1 bg-black/20 rounded text-xs font-mono text-white/80">[F12]</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
