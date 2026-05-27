import { useState } from 'react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CreditCard, Tag, FileText, Settings, XCircle, LogOut, Store, Receipt, Users, Sun, Moon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export function ActionPane() {
  const { items, invoiceType, setInvoiceType, clearCart, setDiscount, currentUserRole, setRole } = useCartStore();
  const { shopName, role: authRole, tenantId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();
  const { theme, toggleTheme } = useThemeStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;

    if (window.electronAPI) {
      const invoice_id = uuidv4();
      const invoice_number = `INV-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;

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

      try {
        let receiptText = `================================\n`;
        receiptText += `          INVOICE\n`;
        receiptText += `================================\n`;
        receiptText += `INV No: ${invoice_number}\n`;
        receiptText += `--------------------------------\n`;
        
        items.forEach(item => {
          receiptText += `${item.name}\n`;
          receiptText += `  ${item.quantity} x ${item.base_price.toFixed(2)} = ${(item.quantity * item.base_price).toFixed(2)}\n`;
        });
        
        receiptText += `--------------------------------\n`;
        receiptText += `SUBTOTAL:      ${subtotal.toFixed(2)}\n`;
        if (totalTax > 0) receiptText += `TAX:           ${totalTax.toFixed(2)}\n`;
        if (discount > 0) receiptText += `DISCOUNT:     -${discount.toFixed(2)}\n`;
        receiptText += `--------------------------------\n`;
        receiptText += `GRAND TOTAL:   ${grandTotal.toFixed(2)}\n`;
        receiptText += `================================\n`;
        
        const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
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
    <div className="flex flex-col h-full w-[40%] bg-card text-card-foreground border-l border-border z-10 relative">
      {/* Top Bar */}
      <div className="flex p-3 gap-2 justify-between items-center border-b border-border">
        {/* Shop name */}
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate">{shopName || 'My Shop'}</span>
          {authRole && (
            <Badge variant={authRole === 'OWNER' ? 'default' : 'secondary'} className="text-[10px]">
              {authRole}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Role toggle */}
          {authRole === 'OWNER' && (
            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border">
              <button
                onClick={() => setRole('CASHIER')}
                className={clsx('px-2 py-1 text-[10px] font-bold rounded transition-colors', currentUserRole === 'CASHIER' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
              >
                CASHIER
              </button>
              <button
                onClick={() => setRole('OWNER')}
                className={clsx('px-2 py-1 text-[10px] font-bold rounded transition-colors', currentUserRole === 'OWNER' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
              >
                OWNER
              </button>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {currentUserRole === 'OWNER' && (
            <>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-inventory-manager'))}
                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                title="Manage Inventory"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-staff-manager'))}
                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                title="Staff Management"
              >
                <Users className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-sales-history'))}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
            title="Sales History"
          >
            <Receipt className="w-4 h-4" />
          </button>
          <button onClick={clearCart} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors" title="Clear Cart">
            <XCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => logout()}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Invoice Type Toggle */}
      <div className="p-6">
        <div className="flex bg-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setInvoiceType('GST')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300",
              invoiceType === 'GST' 
                ? "bg-background text-foreground shadow" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            GST Tax Invoice
          </button>
          <button
            onClick={() => setInvoiceType('BILL_OF_SUPPLY')}
            className={clsx(
              "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300",
              invoiceType === 'BILL_OF_SUPPLY' 
                ? "bg-background text-foreground shadow" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Bill of Supply
          </button>
        </div>
      </div>

      <div className="flex-1"></div>

      {/* Totals Section */}
      <div className="px-6 py-4 space-y-4">
        <div className="flex justify-between text-muted-foreground font-medium">
          <span>Subtotal</span>
          <span className="text-foreground">₹{subtotal.toFixed(2)}</span>
        </div>

        {invoiceType === 'GST' && (
          <div className="space-y-2 border-y border-border py-3 my-2">
            {igst > 0 ? (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>IGST</span>
                <span>₹{igst.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>CGST</span>
                  <span>₹{cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>SGST</span>
                  <span>₹{sgst.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm font-semibold text-primary pt-1">
              <span>Total Tax</span>
              <span>₹{totalTax.toFixed(2)}</span>
            </div>
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-primary font-medium">
            <span>Discount</span>
            <span>-₹{discount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-end pt-4">
          <span className="text-xl font-bold text-foreground">Grand Total</span>
          <span className="text-4xl font-bold text-primary">
            ₹{grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Hardware Error Notification */}
      {hardwareError && (
        <div className="mx-6 mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-2">
          <Settings className="w-5 h-5 animate-pulse" />
          <p className="text-sm font-bold flex-1">{hardwareError}</p>
          <button onClick={() => setHardwareError(null)} className="ml-auto hover:bg-destructive/20 p-1 rounded-lg">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-6 grid grid-cols-2 gap-4">
        <Button 
          variant="outline"
          className="col-span-1 h-auto py-4 flex flex-col gap-2 rounded-xl"
          onClick={() => {
            const val = prompt('Enter discount amount:');
            if (val) setDiscount(parseFloat(val));
          }}
        >
          <Tag className="w-5 h-5" />
          <span className="font-semibold text-sm">Discount</span>
          <span className="text-[10px] text-muted-foreground font-mono">[F8]</span>
        </Button>

        <Button 
          variant="outline"
          className="col-span-1 h-auto py-4 flex flex-col gap-2 rounded-xl"
        >
          <FileText className="w-5 h-5" />
          <span className="font-semibold text-sm">Hold Bill</span>
          <span className="text-[10px] text-muted-foreground font-mono">[F9]</span>
        </Button>

        <Button 
          onClick={handleCheckout}
          disabled={isCheckingOut || items.length === 0}
          className="col-span-2 h-auto py-5 flex items-center justify-center gap-3 text-lg font-bold rounded-xl shadow-md transition-transform active:scale-[0.98]"
        >
          {isCheckingOut ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              <span>PROCESSING...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-6 h-6" />
              <span>CHECKOUT / PRINT</span>
              <span className="ml-2 px-2 py-1 bg-black/10 rounded text-xs font-mono opacity-80">[F12]</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
