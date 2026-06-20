import { useState, useRef, useEffect } from 'react';
import { useCartStore, useCartTotals } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CreditCard, Tag, FileText, Settings, XCircle, LogOut, Store, Receipt, Users, Sun, Moon, CheckCircle2, X, TrendingUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { generateReceiptText, type ReceiptData } from '../utils/receiptGenerator';

export function ActionPane() {
  const discountInputRef = useRef<HTMLInputElement>(null);
  const { items, invoiceType, setInvoiceType, clearCart, setDiscount, currentUserRole, setRole, discountType, discountValue } = useCartStore();
  const { shopName, role: authRole, tenantId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();
  const { theme, toggleTheme } = useThemeStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  const [tempDiscountValue, setTempDiscountValue] = useState(0);
  const [tempDiscountType, setTempDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [pastBillSearch, setPastBillSearch] = useState('');
  const [foundInvoices, setFoundInvoices] = useState<any[]>([]);
  const [selectedPastInvoice, setSelectedPastInvoice] = useState<any | null>(null);
  const [selectedPastInvoiceId, setSelectedPastInvoiceId] = useState<string | null>(null);
  const [pastInvoiceItems, setPastInvoiceItems] = useState<any[]>([]);
  const [isSavingPastBill, setIsSavingPastBill] = useState(false);
  const [pastBillSuccess, setPastBillSuccess] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [pastBillView, setPastBillView] = useState<'search' | 'detail'>('search');

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;

    if (window.electronAPI) {
      const invoice_id = uuidv4();
      // Generate invoice number from counter, fallback to timestamp-based
      let invoice_number = `INV-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
      try {
        if (window.electronAPI) {
          const { tenantId } = useAuthStore.getState();
          const result = await window.electronAPI.dbGetNextInvoiceNumber({ tenant_id: tenantId || 'global' });
          if (result.success && result.invoiceNumber) {
            invoice_number = result.invoiceNumber;
          }
        }
      } catch (e) {
        console.error('Failed to generate invoice number from counter, using fallback', e);
      }

      const lineItems = items.map((item) => {
        const effectiveRate = item.pricing_mode === 'GRADE_RATE' 
          ? item.base_price + (item.grade_rate || 0) 
          : item.base_price;
          
        const pieceCount = Number(item.quantity) || 0;
        
        let itemTotal = 0;
        if (item.billing_type === 'WEIGHT') {
          const weightToUse = item.calculated_weight || 0;
          itemTotal = effectiveRate * weightToUse;
        } else {
          itemTotal = effectiveRate * pieceCount;
        }
        
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
        const [shopAddr, shopPh, upi, showQr] = await Promise.all([
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_address' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'upi_id' }),
          window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        ]);

        const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
        const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;

        const receiptData: ReceiptData = {
          shopName: shopName || 'My Shop',
          shopAddress: shopAddr || undefined,
          shopPhone: shopPh || undefined,
          upiId: upi || undefined,
          showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
          invoiceNumber: invoice_number,
          date: new Date().toLocaleString(),
          cashierName: useAuthStore.getState().role || undefined,
          items: items.map(item => {
            const effectiveRate = item.pricing_mode === 'GRADE_RATE' 
              ? item.base_price + (item.grade_rate || 0) 
              : item.base_price;
              
            const pieceCount = Number(item.quantity) || 0;
            
            let itemTotal = 0;
            if (item.billing_type === 'WEIGHT') {
              const weightToUse = item.calculated_weight || 0;
              itemTotal = effectiveRate * weightToUse;
            } else {
              itemTotal = effectiveRate * pieceCount;
            }
            
            const ratePerPiece = pieceCount > 0 ? itemTotal / pieceCount : effectiveRate;
            
            return {
              name: item.name,
              quantity: pieceCount,
              unit_price: ratePerPiece,
              total: itemTotal
            };
          }),
          subtotal,
          tax: totalTax,
          discount,
          discountType: useCartStore.getState().discountType,
          discountValue: useCartStore.getState().discountValue,
          grandTotal
        };

        const receiptText = generateReceiptText(receiptData, receiptWidthCm);
        
        const printResult = await window.electronAPI.printReceipt(tenantId || 'global', receiptText);
        
        if (!printResult.success) {
          setHardwareError(`Printing failed: ${printResult.error || 'Check printer'}`);
          setIsCheckingOut(false);
          return;
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
      } catch (e) {
        setHardwareError('Communication error with hardware services.');
        setIsCheckingOut(false);
        return;
      }
    }

    clearCart();
    setIsCheckingOut(false);
  };

  const handleCloseDiscountModal = () => {
    setIsDiscountModalOpen(false);
    setTimeout(() => {
      setPastBillSuccess(null);
      setPastBillSearch('');
      setFoundInvoices([]);
      setSelectedPastInvoice(null);
      setSelectedPastInvoiceId(null);
      setPastInvoiceItems([]);
      setEditedItems([]);
      setEditMode(false);
      setPastBillView('search');
      setTempDiscountValue(0);
      setTempDiscountType('FIXED');
    }, 200);
  };

  const handleSearchPastInvoice = async () => {
    if (!window.electronAPI || !pastBillSearch) return;
    setPastBillSuccess(null);
    setPastBillView('search');
    try {
      const results = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId || 'global', search: pastBillSearch });
      setFoundInvoices(Array.isArray(results) ? results : []);
      if (Array.isArray(results) && results.length === 1) {
        setSelectedPastInvoiceId(results[0].invoice_id);
      } else {
        setSelectedPastInvoiceId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPastInvoice = async (inv: any) => {
    setSelectedPastInvoice(inv);
    setSelectedPastInvoiceId(inv.invoice_id);
    setPastBillView('detail');
    setEditMode(false);
    setPastBillSuccess(null);
    setTempDiscountValue(inv.discount_value || 0);
    setTempDiscountType(inv.discount_type || 'FIXED');
    if (window.electronAPI) {
      const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
      const items = Array.isArray(data) ? data : [];
      setPastInvoiceItems(items);
      setEditedItems(items.map((item: any) => ({ ...item })));
    }
  };

  const handleEditItem = (index: number, field: string, value: any) => {
    setEditedItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const qty = field === 'quantity' ? Number(value) : Number(updated[index].quantity);
        const price = field === 'unit_price' ? Number(value) : Number(updated[index].unit_price);
        updated[index].total = qty * price;
      }
      return updated;
    });
  };

  const handleRemoveEditItem = (index: number) => {
    setEditedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePastBill = async () => {
    if (!window.electronAPI || !selectedPastInvoice || !authRole) return;
    setIsSavingPastBill(true);
    setPastBillSuccess(null);
    try {
      const newSubtotal = editedItems.reduce((sum, item) => sum + item.total, 0);
      const newTaxTotal = editedItems.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
      let newDiscountTotal = 0;
      if (tempDiscountType === 'PERCENTAGE') {
        newDiscountTotal = newSubtotal * (tempDiscountValue / 100);
      } else {
        newDiscountTotal = tempDiscountValue;
      }
      const newGrandTotal = newSubtotal + newTaxTotal - newDiscountTotal;

      const r = await window.electronAPI.dbUpdateInvoice({
        invoice_id: selectedPastInvoice.invoice_id,
        tenant_id: tenantId || 'global',
        role: authRole,
        subtotal: newSubtotal,
        tax_total: newTaxTotal,
        discount_total: newDiscountTotal,
        discount_type: tempDiscountType,
        discount_value: tempDiscountValue,
        grand_total: newGrandTotal,
        payment_method: selectedPastInvoice.payment_method || 'CASH',
        customer_name: selectedPastInvoice.customer_name,
        customer_phone: selectedPastInvoice.customer_phone,
        customer_gstin: selectedPastInvoice.customer_gstin,
        customer_state: selectedPastInvoice.customer_state,
        items: editedItems.map(item => ({
          item_id: item.item_id,
          product_id: item.product_id,
          name: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          tax_amount: Number(item.tax_amount || 0),
          total: Number(item.total),
        })),
      });
      if (r.success) {
        setPastBillSuccess('Bill updated successfully!');
        setEditMode(false);
      } else {
        alert('Failed: ' + r.error);
      }
    } catch {
      alert('Failed to save bill');
    } finally {
      setIsSavingPastBill(false);
    }
  };

  const handleApplyPastDiscount = async () => {
    if (!window.electronAPI || !selectedPastInvoiceId || !authRole) return;
    setIsSavingPastBill(true);
    setPastBillSuccess(null);
    try {
      const result = await window.electronAPI.dbApplyInvoiceDiscount({
        invoice_id: selectedPastInvoiceId,
        discount_type: tempDiscountType,
        discount_value: tempDiscountValue,
        role: authRole,
      });
      if (result.success) {
        setPastBillSuccess('Discount applied successfully!');
        if (selectedPastInvoice) {
          setSelectedPastInvoice({ ...selectedPastInvoice, discount_type: tempDiscountType, discount_value: tempDiscountValue });
        }
      } else {
        alert('Failed to apply discount: ' + result.error);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to apply discount');
    } finally {
      setIsSavingPastBill(false);
    }
  };

  useKeyboardShortcuts({
    'F8': () => {
      discountInputRef.current?.focus();
      discountInputRef.current?.select();
    },
    'F12': handleCheckout
  });

  useEffect(() => {
    const handler = () => {
      const search = localStorage.getItem('pastBillSearch');
      if (search) {
        setPastBillSearch(search);
        setIsDiscountModalOpen(true);
        localStorage.removeItem('pastBillSearch');
      }
    };
    window.addEventListener('open-past-bill', handler);
    return () => window.removeEventListener('open-past-bill', handler);
  }, []);

  useEffect(() => {
    if (isDiscountModalOpen && pastBillSearch) {
      const timer = setTimeout(() => handleSearchPastInvoice(), 100);
      return () => clearTimeout(timer);
    }
  }, [isDiscountModalOpen, pastBillSearch]);

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
            <TrendingUp className="w-4 h-4" />
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
          onClick={() => {
            setIsDiscountModalOpen(true);
          }}
        >
          <Receipt className="w-4 h-4" />
          <span className="font-semibold text-sm">Past Bill</span>
        </Button>

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

      <Modal isOpen={isDiscountModalOpen} onClose={handleCloseDiscountModal} title={<div className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /><span>Past Bill</span></div>}>
        <div className="space-y-4 min-w-[480px]">
          {pastBillView === 'detail' && selectedPastInvoice ? (
            <div className="space-y-4">
              <button onClick={() => { setPastBillView('search'); setEditMode(false); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                ← Back to search
              </button>

              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{selectedPastInvoice.invoice_number}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(selectedPastInvoice.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right text-2xl font-black text-primary">₹{selectedPastInvoice.grand_total.toFixed(2)}</div>
              </div>

              {(selectedPastInvoice.customer_name || selectedPastInvoice.customer_phone) && (
                <div className="flex gap-4 p-3 bg-muted/30 rounded-lg text-xs">
                  {selectedPastInvoice.customer_name && (
                    <div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{selectedPastInvoice.customer_name}</span></div>
                  )}
                  {selectedPastInvoice.customer_phone && (
                    <div><span className="text-muted-foreground">Phone: </span><span className="font-medium">{selectedPastInvoice.customer_phone}</span></div>
                  )}
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-xl p-2">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Total</div>
                  {editMode && <div className="col-span-1" />}
                </div>
                {(editMode ? editedItems : pastInvoiceItems).map((item, index) => (
                  <div key={item.item_id || index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm">
                    <div className="col-span-5 font-medium truncate">{item.name}</div>
                    {editMode ? (
                      <>
                        <div className="col-span-2">
                          <input type="number" min="0" step="any"
                            className="w-full text-center h-8 bg-muted/30 border border-border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.quantity}
                            onChange={e => handleEditItem(index, 'quantity', e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                        <div className="col-span-2">
                          <input type="number" min="0" step="any"
                            className="w-full text-right h-8 bg-muted/30 border border-border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.unit_price}
                            onChange={e => handleEditItem(index, 'unit_price', e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                        <div className="col-span-2 text-right font-bold">₹{item.total.toFixed(2)}</div>
                        <div className="col-span-1 text-right">
                          <button onClick={() => handleRemoveEditItem(index)}
                            className="p-1 text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                        <div className="col-span-2 text-right text-muted-foreground">₹{item.unit_price.toFixed(2)}</div>
                        <div className="col-span-2 text-right font-bold">₹{item.total.toFixed(2)}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>₹{(editMode ? editedItems.reduce((s, i) => s + i.total, 0) : selectedPastInvoice.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>₹{(editMode ? editedItems.reduce((s, i) => s + (i.tax_amount || 0), 0) : selectedPastInvoice.tax_total).toFixed(2)}</span>
                </div>
                {selectedPastInvoice.discount_total > 0 && !editMode && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount {selectedPastInvoice.discount_type === 'PERCENTAGE' && selectedPastInvoice.discount_value ? `(${selectedPastInvoice.discount_value}%)` : ''}</span>
                    <span>-₹{selectedPastInvoice.discount_total.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Grand Total</span>
                  <span className="text-primary">₹{(
                    editMode
                      ? (editedItems.reduce((s, i) => s + i.total, 0) + editedItems.reduce((s, i) => s + (i.tax_amount || 0), 0) - 
                        (tempDiscountType === 'PERCENTAGE' 
                          ? editedItems.reduce((s, i) => s + i.total, 0) * (tempDiscountValue / 100)
                          : tempDiscountValue))
                      : selectedPastInvoice.grand_total
                  ).toFixed(2)}</span>
                </div>
              </div>

              {authRole === 'OWNER' && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Discount</div>
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                      <button onClick={() => setTempDiscountType('FIXED')}
                        className={clsx('flex-1 py-2 rounded-md font-semibold text-sm transition-all', tempDiscountType === 'FIXED' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>Fixed (₹)</button>
                      <button onClick={() => setTempDiscountType('PERCENTAGE')}
                        className={clsx('flex-1 py-2 rounded-md font-semibold text-sm transition-all', tempDiscountType === 'PERCENTAGE' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')}>Percent (%)</button>
                    </div>
                    <Input type="number" min="0" max={tempDiscountType === 'PERCENTAGE' ? '100' : undefined}
                      value={tempDiscountValue || ''} onChange={e => setTempDiscountValue(Number(e.target.value))}
                      placeholder={tempDiscountType === 'PERCENTAGE' ? 'Enter %' : 'Enter amount'} />
                  </div>

                  <div className="flex gap-2">
                    {!editMode ? (
                      <>
                        <Button variant="outline" onClick={() => setEditMode(true)} className="flex-1">
                          <Tag className="w-4 h-4" /> Edit Items
                        </Button>
                        <Button onClick={handleApplyPastDiscount} disabled={isSavingPastBill} className="flex-1">
                          {isSavingPastBill ? 'Applying...' : 'Apply Discount'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditMode(false); setEditedItems(pastInvoiceItems.map((i: any) => ({ ...i }))); }} className="flex-1 px-4 py-2.5 text-sm font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-xl transition-colors">
                          Cancel
                        </button>
                        <Button onClick={handleSavePastBill} disabled={isSavingPastBill} className="flex-1">
                          {isSavingPastBill ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </>
                    )}
                  </div>

                  {pastBillSuccess && (
                    <div className="p-3 bg-primary/5 text-primary border border-primary/20 rounded-lg text-center text-sm font-semibold animate-in fade-in">
                      <CheckCircle2 className="w-5 h-5 inline mr-1" />
                      {pastBillSuccess}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button onClick={handleCloseDiscountModal} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors">Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input placeholder="Search by invoice number or customer..."
                  value={pastBillSearch}
                  onChange={(e) => setPastBillSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchPastInvoice();
                    }
                  }} />
                <Button onClick={handleSearchPastInvoice}>Search</Button>
              </div>

              {foundInvoices.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {foundInvoices.map(inv => (
                    <div key={inv.invoice_id} onClick={() => handleSelectPastInvoice(inv)}
                      className={clsx('p-3 border rounded-lg cursor-pointer flex justify-between items-center transition-colors text-sm hover:bg-muted/50',
                        selectedPastInvoiceId === inv.invoice_id ? 'border-primary bg-primary/5' : 'border-border')}>
                      <div>
                        <div className="font-medium">{inv.invoice_number}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                        {inv.discount_total > 0 && (
                          <div className="text-[10px] text-destructive font-medium">Discounted (-₹{inv.discount_total.toFixed(2)})</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold">₹{inv.grand_total.toFixed(2)}</div>
                        {inv.cashier_name && <div className="text-[10px] text-muted-foreground">{inv.cashier_name}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {foundInvoices.length === 0 && pastBillSearch && (
                <div className="text-center text-muted-foreground text-sm py-4">No invoices found</div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
