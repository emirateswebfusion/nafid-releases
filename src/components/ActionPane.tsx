import { useState, useRef, useEffect, useCallback } from 'react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CreditCard, FileText, Settings, XCircle, LogOut, Store, Users, Sun, Moon, TrendingUp, Undo2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../utils/receiptGenerator';
import { generateInvoiceHtml } from '../utils/invoiceHtmlGenerator';
import { loadFeatureFlags } from '../featureFlags';

export function ActionPane() {
  const discountInputRef = useRef<HTMLInputElement>(null);
  const { items, invoiceType, setInvoiceType, clearCart, setDiscount, currentUserRole, setRole, discountType, discountValue } = useCartStore();
  const { shopName, role: authRole, tenantId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();
  const { theme, toggleTheme } = useThemeStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    loadFeatureFlags(tenantId || 'global').then(flags => setFeatureFlags(flags));
  }, [tenantId]);

  const [reservedInvoiceNumber, setReservedInvoiceNumber] = useState('');

  const peekInvoiceNumber = useCallback(async () => {
    if (!window.electronAPI) return;
    if (reservedInvoiceNumber) return;
    try {
      const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global' });
      if (result.success && result.invoiceNumber) {
        setReservedInvoiceNumber(result.invoiceNumber);
      }
    } catch (e) {
      console.error('Failed to peek invoice number', e);
    }
  }, [tenantId, reservedInvoiceNumber]);

  useEffect(() => {
    peekInvoiceNumber();
  }, [peekInvoiceNumber]);

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;

    if (window.electronAPI) {
      const invoice_id = uuidv4();
      // Try cloud server first for conflict-free numbering across computers
      let invoice_number: string;
      const serverResult = await window.electronAPI.dbGetNextServerInvoiceNumber({ tenant_id: tenantId || 'global' });
      if (serverResult.success && serverResult.invoiceNumber) {
        invoice_number = serverResult.invoiceNumber;
      } else {
        // Offline fallback: use local counter
        const localResult = await window.electronAPI.dbGetNextInvoiceNumber({ tenant_id: tenantId || 'global' });
        invoice_number = localResult.success && localResult.invoiceNumber
          ? localResult.invoiceNumber
          : `${tenantId?.substring(0, 4).toUpperCase() || 'POS1'}-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
      }

      const lineItems = items.map((item) => {
        const effectiveRate = item.pricing_mode === 'GRADE_RATE' 
          ? (item.grade_rate || 0) 
          : item.base_price;
          
        const pieceCount = Number(item.quantity) || 0;

        let itemTotal = effectiveRate * pieceCount;

        const ratePerPiece = pieceCount > 0 ? itemTotal / pieceCount : effectiveRate;
        
        const taxAmount = invoiceType === 'GST'
          ? itemTotal * (item.tax_rate_percent / 100)
          : 0;

        return {
          item_id: uuidv4(),
          product_id: item.product_id,
          name: item.name,
          quantity: pieceCount,
          unit_price: ratePerPiece,
          tax_amount: taxAmount,
          total: itemTotal,
        };
      });

      setIsCheckingOut(true);
      setHardwareError(null);

      try {
        const [shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
        ]);

        const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
        const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;

        const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
        const useA4 = printFmt?.format === 'a4';
        const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.billSettings || {}) };

        const receiptData: ReceiptData = {
          shopName: billSettings.showShopName ? (shopName || 'My Shop') : '',
          shopGstin: billSettings.showShopGstin ? (shopGstin || undefined) : undefined,
          shopAddress: billSettings.showShopAddress ? (shopAddr || undefined) : undefined,
          shopPhone: billSettings.showPhone ? (shopPh || undefined) : undefined,
          upiId: upi || undefined,
          showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
          showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
          invoiceNumber: invoice_number,
          date: formatBillDateTime(new Date()),
          billerName: useAuthStore.getState().role || undefined,
          items: items.map(item => {
            const effectiveRate = item.pricing_mode === 'GRADE_RATE' 
              ? (item.grade_rate || 0) 
              : item.base_price;
               
            const pieceCount = Number(item.quantity) || 0;

            let itemTotal = effectiveRate * pieceCount;

            const ratePerPiece = pieceCount > 0 ? itemTotal / pieceCount : effectiveRate;
            
            return {
              name: item.name,
              quantity: pieceCount,
              unit_price: ratePerPiece,
              total: itemTotal,
              brand: item.brand_manufacturer || undefined,
            };
          }),
          subtotal,
          tax: totalTax,
          discount,
          discountType: useCartStore.getState().discountType,
          discountValue: useCartStore.getState().discountValue,
          grandTotal,
          invoiceType,
          billSettings,
        };

        if (useA4) {
          const invoiceHtml = generateInvoiceHtml(receiptData, printFmt?.style || 'standard');
          const printResult = await window.electronAPI.printA4Html(tenantId || 'global', invoiceHtml);
          if (!printResult.success) {
            const pw = window.open('', '_blank');
            if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
          }
        } else {
          const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : receiptWidthCm;
          const thermalStyle = printFmt?.style || 'standard';
          const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
          const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
          if (!printResult.success) {
            setHardwareError(`Printing failed: ${printResult.error || 'Check printer'}`);
            setIsCheckingOut(false);
            return;
          }
        }

        const drawerResult = await window.electronAPI.openCashDrawer(tenantId || 'global');
        if (!drawerResult.success) {
          setHardwareError(`Hardware connection issue: ${drawerResult.error || 'Check drawer'}`);
        }

        const result = await window.electronAPI.dbCheckout({
          invoice_id,
          tenant_id: tenantId || 'unset',
          user_id: useAuthStore.getState().userId || 'unset',
          invoice_number,
          invoice_type: invoiceType,
          subtotal,
          tax_total: totalTax,
          discount_total: discount,
          discount_type: useCartStore.getState().discountType,
          discount_value: useCartStore.getState().discountValue,
          grand_total: grandTotal,
          items: lineItems,
        });

        if (!result.success) {
          alert('Checkout failed: ' + result.error);
          setIsCheckingOut(false);
          return;
        }
        try {
          window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { invoice_id: invoice_id || '', invoice_number: invoice_number || '' } }));
        } catch (e) { /* ignore */ }
      } catch (e) {
        setHardwareError('Communication error with hardware services.');
        setIsCheckingOut(false);
        return;
      }
    }

    clearCart();
    setIsCheckingOut(false);
    setReservedInvoiceNumber('');
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.dbPeekNextInvoiceNumber({ tenant_id: tenantId || 'global' });
        if (result.success && result.invoiceNumber) {
          setReservedInvoiceNumber(result.invoiceNumber);
        }
      }
    } catch (e) {
      console.error('Failed to peek next invoice number', e);
    }
  };

  useKeyboardShortcuts({
    'F8': () => {
      discountInputRef.current?.focus();
      discountInputRef.current?.select();
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
                onClick={() => setRole('BILLER')}
                className={clsx('px-2 py-1 text-[10px] font-bold rounded transition-colors', currentUserRole === 'BILLER' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
              >
                BILLER
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
              {(!featureFlags || featureFlags.inventory) && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-inventory-manager'))}
                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                title="Manage Inventory"
              >
                <Settings className="w-4 h-4" />
              </button>
              )}
              {(!featureFlags || featureFlags.staff) && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-staff-manager'))}
                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                title="Staff Management"
              >
                <Users className="w-4 h-4" />
              </button>
              )}
            </>
          )}
          {(!featureFlags || featureFlags.sales_history) && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-sales-history'))}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
            title="Sales History"
          >
            <TrendingUp className="w-4 h-4" />
          </button>
          )}
          {(!featureFlags || featureFlags.returns) && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-returns-manager'))}
            className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-muted rounded-lg transition-colors"
            title="Returns"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          )}
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
        </div>
      </div>

      <div className="flex-1"></div>

        {/* Totals Section */}
        <div className="px-5 py-3 space-y-3">
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

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground font-medium flex items-center gap-2">
              <span>Discount</span>
              <div className="flex bg-muted p-0.5 rounded-md border border-border">
                <button 
                  onClick={() => setDiscount(discountValue, 'FIXED')}
                  className={clsx('px-2 py-0.5 text-xs font-bold rounded', discountType === 'FIXED' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  ₹
                </button>
                <button 
                  onClick={() => setDiscount(discountValue, 'PERCENTAGE')}
                  className={clsx('px-2 py-0.5 text-xs font-bold rounded', discountType === 'PERCENTAGE' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  %
                </button>
              </div>
            </div>
            <Input 
              ref={discountInputRef}
              type="number"
              min="0"
              max={discountType === 'PERCENTAGE' ? "100" : undefined}
              className="w-24 text-right h-8"
              value={discountValue || ''}
              onChange={(e) => setDiscount(e.target.value === '' ? 0 : Number(e.target.value), discountType)}
              placeholder="0"
            />
          </div>

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
      <div className="p-4 grid grid-cols-2 gap-3 border-t border-border bg-card">
        <Button 
          variant="outline"
          className="col-span-1 h-auto py-2 flex items-center justify-center gap-2 rounded-xl"
        >
          <FileText className="w-4 h-4" />
          <span className="font-semibold text-sm">Hold Bill</span>
          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">[F9]</span>
        </Button>

        <Button 
          onClick={handleCheckout}
          disabled={isCheckingOut || items.length === 0}
          className="col-span-2 h-auto py-3.5 flex items-center justify-center gap-2 text-base font-bold rounded-xl shadow-md transition-transform active:scale-[0.98]"
        >
          {isCheckingOut ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              <span>PROCESSING...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              <span>CHECKOUT / PRINT</span>
              <span className="ml-2 px-1.5 py-0.5 bg-black/10 rounded text-[10px] font-mono opacity-80">[F12]</span>
            </>
          )}
        </Button>
      </div>


    </div>
  );
}
