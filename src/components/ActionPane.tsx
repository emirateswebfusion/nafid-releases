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
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { generateReceiptText, type ReceiptData } from '../utils/receiptGenerator';

export function ActionPane() {
  const { items, invoiceType, setInvoiceType, clearCart, setDiscount, currentUserRole, setRole } = useCartStore();
  const { shopName, role: authRole, tenantId, logout } = useAuthStore();
  const { subtotal, cgst, sgst, igst, totalTax, discount, grandTotal } = useCartTotals();
  const { theme, toggleTheme } = useThemeStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountModalTab, setDiscountModalTab] = useState<'CURRENT' | 'PAST'>('CURRENT');
  const [tempDiscountValue, setTempDiscountValue] = useState(0);
  const [tempDiscountType, setTempDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [pastInvoiceShortcode, setPastInvoiceShortcode] = useState('');
  const [foundInvoices, setFoundInvoices] = useState<any[]>([]);
  const [selectedPastInvoiceId, setSelectedPastInvoiceId] = useState<string | null>(null);
  const [isApplyingPastDiscount, setIsApplyingPastDiscount] = useState(false);
  const [pastDiscountSuccess, setPastDiscountSuccess] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (grandTotal === 0 || items.length === 0) return;

    if (window.electronAPI) {
      const invoice_id = uuidv4();
      const invoice_number = `INV-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;

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
        const receiptConfig = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
        const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;

        const receiptData: ReceiptData = {
          shopName: shopName || 'My Shop',
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
    // Allow modal exit animation to play out before clearing state
    setTimeout(() => {
      setDiscountModalTab('CURRENT');
      setPastDiscountSuccess(null);
      setPastInvoiceShortcode('');
      setFoundInvoices([]);
      setSelectedPastInvoiceId(null);
      setTempDiscountValue(0);
      setTempDiscountType('FIXED');
    }, 200);
  };

  const handleSearchPastInvoice = async () => {
    if (!window.electronAPI || !pastInvoiceShortcode) return;
    setPastDiscountSuccess(null);
    try {
      const results = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId || 'global', search: pastInvoiceShortcode });
      const undiscounted = results.filter((inv: any) => !inv.discount_total || inv.discount_total === 0);
      setFoundInvoices(undiscounted);
      if (undiscounted.length === 1) {
        setSelectedPastInvoiceId(undiscounted[0].invoice_id);
      } else {
        setSelectedPastInvoiceId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyPastDiscount = async () => {
    if (!window.electronAPI || !selectedPastInvoiceId) return;
    setIsApplyingPastDiscount(true);
    setPastDiscountSuccess(null);
    try {
      const result = await window.electronAPI.dbApplyInvoiceDiscount({
        invoice_id: selectedPastInvoiceId,
        discount_type: tempDiscountType,
        discount_value: tempDiscountValue
      });
      if (result.success) {
        setPastDiscountSuccess('Discount applied successfully to past invoice!');
      } else {
        alert('Failed to apply discount: ' + result.error);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to apply discount');
    } finally {
      setIsApplyingPastDiscount(false);
    }
  };

  useKeyboardShortcuts({
    'F8': () => {
      setTempDiscountValue(useCartStore.getState().discountValue);
      setTempDiscountType(useCartStore.getState().discountType);
      setIsDiscountModalOpen(true);
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
            setTempDiscountValue(useCartStore.getState().discountValue);
            setTempDiscountType(useCartStore.getState().discountType);
            setIsDiscountModalOpen(true);
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

      <Modal isOpen={isDiscountModalOpen} onClose={handleCloseDiscountModal} title="Apply Bill Discount">
        <div className="space-y-4">
          {authRole === 'OWNER' && (
            <div className="flex gap-2 p-1 bg-muted rounded-lg mb-4">
              <button 
                className={clsx('flex-1 py-1.5 rounded-md font-semibold text-sm', discountModalTab === 'CURRENT' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setDiscountModalTab('CURRENT')}
              >
                Current Bill
              </button>
              <button 
                className={clsx('flex-1 py-1.5 rounded-md font-semibold text-sm', discountModalTab === 'PAST' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => { setDiscountModalTab('PAST'); setPastDiscountSuccess(null); }}
              >
                Past Bill
              </button>
            </div>
          )}

          {discountModalTab === 'CURRENT' ? (
            <>
              <div className="flex gap-2 p-1 bg-muted rounded-lg">
                <button 
                  className={clsx('flex-1 py-2 rounded-md font-semibold text-sm', tempDiscountType === 'FIXED' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => setTempDiscountType('FIXED')}
                >
                  Fixed Amount (₹)
                </button>
                <button 
                  className={clsx('flex-1 py-2 rounded-md font-semibold text-sm', tempDiscountType === 'PERCENTAGE' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => setTempDiscountType('PERCENTAGE')}
                >
                  Percentage (%)
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  {tempDiscountType === 'PERCENTAGE' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                </label>
                <Input 
                  type="number" 
                  min="0"
                  max={tempDiscountType === 'PERCENTAGE' ? "100" : undefined}
                  value={tempDiscountValue || ''} 
                  onChange={(e) => setTempDiscountValue(Number(e.target.value))}
                  autoFocus
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={handleCloseDiscountModal}>Cancel</Button>
                <Button onClick={() => {
                  setDiscount(tempDiscountValue, tempDiscountType);
                  handleCloseDiscountModal();
                }}>Apply Discount</Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {pastDiscountSuccess ? (
                <div className="p-4 bg-primary/10 text-primary border border-primary/20 rounded-xl text-center space-y-4">
                  <div className="font-bold">{pastDiscountSuccess}</div>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={handleCloseDiscountModal}>Close</Button>
                    <Button onClick={() => {
                      localStorage.setItem('salesHistoryInitialSearch', pastInvoiceShortcode);
                      window.dispatchEvent(new CustomEvent('open-sales-history'));
                      handleCloseDiscountModal();
                    }}>View in Sales History</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Enter Last 4 Chars of Invoice" 
                      value={pastInvoiceShortcode}
                      onChange={(e) => setPastInvoiceShortcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchPastInvoice();
                        }
                      }}
                      className="uppercase"
                    />
                    <Button onClick={handleSearchPastInvoice}>Search</Button>
                  </div>

                  {foundInvoices.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Select Invoice</label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {foundInvoices.map((inv: { invoice_id: string, invoice_number: string, created_at: string, grand_total: number }) => (
                          <div 
                            key={inv.invoice_id} 
                            onClick={() => setSelectedPastInvoiceId(inv.invoice_id)}
                            className={clsx('p-3 border rounded-xl cursor-pointer flex justify-between items-center transition-colors', selectedPastInvoiceId === inv.invoice_id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}
                          >
                            <div className="text-sm">
                              <div className="font-bold">{inv.invoice_number}</div>
                              <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                            </div>
                            <div className="font-bold text-foreground">₹{inv.grand_total.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedPastInvoiceId && (
                    <>
                      <div className="flex gap-2 p-1 bg-muted rounded-lg">
                        <button 
                          className={clsx('flex-1 py-2 rounded-md font-semibold text-sm', tempDiscountType === 'FIXED' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                          onClick={() => setTempDiscountType('FIXED')}
                        >
                          Fixed (₹)
                        </button>
                        <button 
                          className={clsx('flex-1 py-2 rounded-md font-semibold text-sm', tempDiscountType === 'PERCENTAGE' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}
                          onClick={() => setTempDiscountType('PERCENTAGE')}
                        >
                          Percent (%)
                        </button>
                      </div>
                      
                      <Input 
                        type="number" 
                        min="0"
                        max={tempDiscountType === 'PERCENTAGE' ? "100" : undefined}
                        value={tempDiscountValue || ''} 
                        onChange={(e) => setTempDiscountValue(Number(e.target.value))}
                        placeholder={tempDiscountType === 'PERCENTAGE' ? "Enter %" : "Enter amount"}
                      />

                      <div className="flex justify-end gap-2 pt-4 border-t border-border">
                        <Button variant="outline" onClick={handleCloseDiscountModal}>Cancel</Button>
                        <Button onClick={handleApplyPastDiscount} disabled={isApplyingPastDiscount}>
                          {isApplyingPastDiscount ? 'Updating...' : 'Update Bill'}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
