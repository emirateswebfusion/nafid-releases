import React from 'react';
import { displayInvoiceNumber } from '../../../utils/invoiceNumberHelper';
import type { DeductionState } from './DeductionEditor';
import { SingleDatePicker } from '../../ui/SingleDatePicker';
import { Select } from '../../ui/Select';
import { MRP_TIER_ID } from '../../../utils/pricingTierHelper';
import clsx from 'clsx';
import { X, Banknote, QrCode, CreditCard, BookOpen, Clock, Recycle, ArrowLeftRight, Coins, Save } from 'lucide-react';
import { type PaymentMethod, formatCurrency } from '../BillingConstants';
import { scrapApi } from '../../../data/scrap';
import { returnsApi } from '../../../data/returns';
import type { Tab } from '../../../store/tabStore';
import type { CartItem, InvoiceType, ShopDomain } from '../../../store/cartStore';
import type { MatchedParty } from '../customerDirectory';
import type { PricingTier } from '../../../utils/pricingTierHelper';
import type { CustomerFieldState } from '../hooks/useCustomerFieldState';

export interface ErpGridWorkspaceProps {
  activeTab: Tab | undefined;
  applyPartyTier: (name: string, phone: string) => void;
  balanceAmount: number;
  canOverrideTier: boolean;
  clearReturnDeduction: () => void;
  clearScrapDeduction: () => void;
  customerFields: CustomerFieldState;
  customerGstin: string;
  customerName: string;
  customerPhone: string;
  customerState: string;
  discountRef: React.RefObject<HTMLInputElement | null>;
  discountValue: number;
  displayGrandTotal: number;
  editingActive: string | null;
  editingInvoiceNumber: string | null;
  enableThreeInvoiceSeries: boolean;
  erpNarration: string;
  erpSalesRep: string;
  findMatchingParty: (name?: string, phone?: string) => MatchedParty | null;
  focusedRowProductId: string | null;
  handleCheckout: (saveOnly?: boolean) => Promise<void>;
  handlePricingTierChange: (tierId: string) => void;
  handleQtyKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  invoiceType: InvoiceType;
  isCheckingOut: boolean;
  isGrandTotalOverridden: boolean;
  items: CartItem[];
  lastAddedProductId: string | null;
  nextInvoiceNumber: string;
  paymentMethod: PaymentMethod;
  pricingTiers: PricingTier[];
  qtyRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  receivedAmount: number;
  receivedInputRef: React.RefObject<HTMLInputElement | null>;
  removeItem: (productId: string) => void;
  searchBarSection: React.ReactNode;
  selectedTierId: string;
  setDiscount: (value: number, type: "FIXED" | "PERCENTAGE") => void;
  setErpNarration: React.Dispatch<React.SetStateAction<string>>;
  setErpSalesRep: React.Dispatch<React.SetStateAction<string>>;
  setFocusedRowProductId: React.Dispatch<React.SetStateAction<string | null>>;
  setReturnDeduction: (amount: number, returnInvoiceNumber: string) => void;
  setScrapDeduction: (amount: number, invoiceNumber: string) => void;
  shopDomain: ShopDomain | null;
  startEditingTotal: () => void;
  storeReturnDeduction: number;
  storeScrapDeduction: number;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
  updateQuantity: (productId: string, quantity: number | string) => void;
  deductions: DeductionState;
}

export function ErpGridWorkspace({ activeTab, applyPartyTier, balanceAmount, canOverrideTier, clearReturnDeduction, clearScrapDeduction, customerFields, customerGstin, customerName, customerPhone, customerState, deductions, discountRef, discountValue, displayGrandTotal, editingActive, editingInvoiceNumber, enableThreeInvoiceSeries, erpNarration, erpSalesRep, findMatchingParty, focusedRowProductId, handleCheckout, handlePricingTierChange, handleQtyKeyDown, invoiceType, isCheckingOut, isGrandTotalOverridden, items, lastAddedProductId, nextInvoiceNumber, paymentMethod, pricingTiers, qtyRefs, receivedAmount, receivedInputRef, removeItem, searchBarSection, selectedTierId, setDiscount, setErpNarration, setErpSalesRep, setFocusedRowProductId, setReturnDeduction, setScrapDeduction, shopDomain, startEditingTotal, storeReturnDeduction, storeScrapDeduction, updateActiveTab, updateQuantity }: ErpGridWorkspaceProps) {
  const { customerPointsBalance, isLoyaltyModuleEnabled, isReturnModuleEnabled, isScrapModuleEnabled, pointsRedeemedCalc, pointsRedeemedDiscountCalc, pointsToRedeem, returnDeductionInputRef, returnDeductionSearchQuery, scrapDeductionInputRef, scrapDeductionSearchQuery, setHardwareError, setPointsToRedeem, setReturnDeductionSearchQuery, setScrapDeductionSearchQuery, tenantId } = deductions;
  const { setShowCustomerDropdown, customerNameInputRef, customerGstinInputRef } = customerFields;
  const selectedParty = findMatchingParty(customerName, customerPhone);
  const uiPartyKey = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
  const uiIsStaffParty = String(selectedParty?.party_type || '').toUpperCase() === 'STAFF';
  const uiEditingContribution = editingActive && !uiIsStaffParty && activeTab?.editingInvoicePartyKey === uiPartyKey
    ? (Number(activeTab?.editingInvoiceContribution) || 0)
    : 0;
  const partyBalance = selectedParty ? (Number(selectedParty.balance) || 0) - uiEditingContribution : 0;
  
  // Focused row item for live stock row indicator
  const activeRowItem = items.find(i => i.product_id === focusedRowProductId) || items[items.length - 1];
  const activeStockDisplay = activeRowItem ? (activeRowItem.current_stock != null ? String(activeRowItem.current_stock) : '—') : '0.00';

  // Sum calculations for footer row
  let totQty = 0;
  let totExcl = 0;
  let totSgst = 0;
  let totCgst = 0;
  let totIgst = 0;
  let totNet = 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      
      {/* ─── ERP TOP HEADER FORM METADATA PANEL ─── */}
      <div className="bg-card border-b border-border px-5 py-3 shrink-0 shadow-xs">
        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Invoice No */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Invoice No</label>
            <input
              type="text"
              readOnly
              value={editingActive ? (editingInvoiceNumber || '') : displayInvoiceNumber(nextInvoiceNumber || '', invoiceType, enableThreeInvoiceSeries)}
              className="w-full px-2.5 py-1.5 bg-muted/50 border border-border rounded-lg font-mono font-bold text-primary text-xs"
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">
              Date
            </label>
            <SingleDatePicker
              value={activeTab?.billDate}
              onChange={val => updateActiveTab({ billDate: val })}
              isEditing={Boolean(editingActive)}
              triggerClassName="w-full py-1.5"
              align="left"
            />
          </div>

          {/* Party / Bill To */}
          <div className="space-y-1 col-span-1 sm:col-span-2 relative">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Party / Bill To</label>
            <div className="relative">
              <input
                ref={customerNameInputRef}
                placeholder="Select Party / Customer Name [F4]"
                value={customerName}
                onFocus={() => setShowCustomerDropdown(true)}
                onChange={e => {
                  const val = e.target.value;
                  updateActiveTab({ customerName: val });
                  applyPartyTier(val, customerPhone);
                  setShowCustomerDropdown(true);
                }}
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 text-xs"
              />
            </div>
          </div>

          {/* GST No */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">GST No</label>
            <input
              ref={customerGstinInputRef}
              placeholder="GSTIN Number"
              value={customerGstin}
              onChange={e => updateActiveTab({ customerGstin: e.target.value.toUpperCase() })}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-mono uppercase text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Price Tier */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Price Mode</label>
            <Select
              size="sm"
              triggerClassName="h-8 py-1"
              className="w-full"
              value={selectedTierId}
              onChange={v => { if (canOverrideTier) handlePricingTierChange(v); }}
              options={pricingTiers.map(t => {
                const isMrp = t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID;
                const labelText = isMrp ? 'MRP' : t.name;
                return {
                  value: isMrp ? '' : t.pricing_tier_id,
                  label: labelText
                };
              })}
            />
          </div>

          {/* Description / Bill Notes */}
          <div className="space-y-1 col-span-1 sm:col-span-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Description / Notes</label>
            <input
              type="text"
              placeholder="Bill Description / Remarks"
              value={activeTab?.description || ''}
              onChange={e => updateActiveTab({ description: e.target.value })}
              onKeyDown={e => e.stopPropagation()}
              onKeyUp={e => e.stopPropagation()}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Rep / Salesperson */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Rep / Salesperson</label>
            <input
              type="text"
              value={erpSalesRep}
              onChange={e => setErpSalesRep(e.target.value)}
              placeholder="Sales Rep Name"
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Narration */}
          <div className="space-y-1 col-span-1 sm:col-span-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Narration / Notes</label>
            <input
              type="text"
              value={erpNarration}
              onChange={e => setErpNarration(e.target.value)}
              placeholder="Remarks or invoice terms..."
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg font-medium text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* ─── SEARCH & BARCODE INPUT HEADER ─── */}
      <div className="px-5 py-2.5 bg-card/60 border-b border-border shrink-0 relative z-30">
        {searchBarSection}
      </div>

      {/* ─── FULL WIDTH SPREADSHEET ERP ITEM TABLE ─── */}
      <div className="flex-1 overflow-auto bg-background p-3">
        <div className="border border-border rounded-xl overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-700 text-white font-extrabold uppercase text-[10px] tracking-wider select-none border-b border-emerald-800">
                <th className="py-2.5 px-2 text-center w-10">Sl.No.</th>
                <th className="py-2.5 px-2.5 w-24">Barcode</th>
                <th className="py-2.5 px-2.5 w-24">Item Code</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-2.5 text-center w-16">Qty</th>
                <th className="py-2.5 px-2.5 text-right w-20">Rate</th>
                <th className="py-2.5 px-2.5 text-right w-20">Rate (Incl)</th>
                <th className="py-2.5 px-2.5 text-right w-24">Total</th>
                <th className="py-2.5 px-2.5 text-right w-16">Disc</th>
                <th className="py-2.5 px-2.5 text-right w-16">SGST</th>
                <th className="py-2.5 px-2.5 text-right w-16">CGST</th>
                <th className="py-2.5 px-2.5 text-right w-16">IGST</th>
                <th className="py-2.5 px-3 text-right w-28">Net Amount</th>
                <th className="py-2.5 px-2 text-center w-10">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-semibold text-foreground">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-muted-foreground italic">
                    No line items added yet. Search products or scan barcode above to populate ERP invoice table.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const isFocusedRow = item.product_id === (focusedRowProductId || lastAddedProductId);
                  const qty = Number(item.quantity) || 0;
                  const baseRate = Number(item.offer_price ?? item.base_price) || 0;
                  const taxRatePct = Number(item.tax_rate_percent ?? (invoiceType === 'GST' ? 18 : 0));
                  const isInterState = Boolean(customerState && shopDomain && customerState !== shopDomain);
                  
                  const exclTotal = baseRate * qty;
                  const taxAmountTotal = exclTotal * (taxRatePct / 100);
                  const inclTotal = exclTotal + taxAmountTotal;
                  const rateIncl = baseRate * (1 + taxRatePct / 100);

                  const sgstVal = invoiceType === 'GST' && !isInterState ? taxAmountTotal / 2 : 0;
                  const cgstVal = invoiceType === 'GST' && !isInterState ? taxAmountTotal / 2 : 0;
                  const igstVal = invoiceType === 'GST' && isInterState ? taxAmountTotal : 0;
                  const discVal = Number(item.discount_flat || 0);

                  totQty += qty;
                  totExcl += exclTotal;
                  totSgst += sgstVal;
                  totCgst += cgstVal;
                  totIgst += igstVal;
                  totNet += inclTotal - discVal;

                  return (
                    <tr
                      key={item.product_id}
                      onClick={() => setFocusedRowProductId(item.product_id)}
                      className={clsx(
                        "transition-colors cursor-pointer text-xs",
                        idx % 2 === 0 ? "bg-emerald-500/5 dark:bg-emerald-950/20" : "bg-card",
                        isFocusedRow ? "bg-emerald-500/20 font-bold ring-1 ring-emerald-500/50" : "hover:bg-emerald-500/10"
                      )}
                    >
                      <td className="py-2 px-2 text-center font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 px-2.5 font-mono text-xs">{item.sku_barcode || '—'}</td>
                      <td className="py-2 px-2.5 font-mono text-xs text-muted-foreground">{item.item_code || '—'}</td>
                      <td className="py-2 px-3 font-bold text-foreground">
                        {item.name}
                        {item.isServiceItem && <span className="ml-2 text-[9px] px-1 py-0.2 bg-violet-500/20 text-violet-600 rounded">SRV</span>}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <input
                          ref={(el) => { qtyRefs.current[item.product_id] = el; }}
                          type="number"
                          step="any"
                          min="1"
                          value={qty}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => handleQtyKeyDown(e, item.product_id)}
                          onChange={(e) => updateQuantity(item.product_id, Number(e.target.value) || 1)}
                          className="w-14 text-center bg-background border border-border rounded px-1 py-0.5 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono">₹{baseRate.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{rateIncl.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono">₹{exclTotal.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono text-emerald-600">₹{discVal.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{sgstVal.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{cgstVal.toFixed(2)}</td>
                      <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">₹{igstVal.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                        ₹{(inclTotal - discVal).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeItem(item.product_id); }}
                          className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Table Footer Status & Column Totals */}
          <div className="bg-emerald-950 text-emerald-100 font-mono text-xs px-4 py-2 border-t border-emerald-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <span className="font-extrabold text-amber-400 uppercase tracking-wider text-[11px]">
                Stock: <strong className="text-white font-mono">{activeStockDisplay}</strong>
              </span>
              <span className="text-emerald-400/80">|</span>
              <span className="font-bold text-[11px]">Total Items: {items.length}</span>
            </div>

            <div className="flex items-center gap-5 text-right font-extrabold">
              <span>Total Qty: <strong className="text-white">{totQty}</strong></span>
              <span>Excl: <strong className="text-white">₹{totExcl.toFixed(2)}</strong></span>
              <span>SGST: <strong className="text-white">₹{totSgst.toFixed(2)}</strong></span>
              <span>CGST: <strong className="text-white">₹{totCgst.toFixed(2)}</strong></span>
              <span>IGST: <strong className="text-white">₹{totIgst.toFixed(2)}</strong></span>
              <span className="text-amber-300 text-sm">Net Amount: <strong className="text-amber-400">₹{totNet.toFixed(2)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BOTTOM ERP SETTLEMENT CONSOLE ─── */}
      <div className="bg-card border-t-2 border-border px-5 py-3 shrink-0 shadow-lg space-y-2.5">
        
        {/* Top Row: Payment Method Selector + Deductions */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-3 py-2 rounded-xl border border-border/60 text-xs font-bold">
          
          {/* Payment Method Options */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Payment Method:</span>
            {[
              { value: 'CASH', label: 'Cash', icon: Banknote },
              { value: 'UPI', label: 'UPI / QR', icon: QrCode },
              { value: 'CARD', label: 'Card', icon: CreditCard },
              { value: 'CREDIT', label: 'Credit', icon: BookOpen },
              { value: 'PENDING', label: 'Pending', icon: Clock },
            ].map((opt) => {
              const isActive = paymentMethod === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateActiveTab({ paymentMethod: opt.value as PaymentMethod })}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background text-foreground border-border hover:bg-muted/60"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Deduction Section (Scrap, Return & Points Credits) */}
          {(isScrapModuleEnabled || isReturnModuleEnabled || isLoyaltyModuleEnabled || storeScrapDeduction > 0 || storeReturnDeduction > 0 || pointsRedeemedDiscountCalc > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Deduction:</span>
              {(isScrapModuleEnabled || storeScrapDeduction > 0) && (
                storeScrapDeduction > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 rounded-lg text-xs font-bold">
                    <Recycle className="w-3.5 h-3.5" />
                    <span>Scrap: -{formatCurrency(storeScrapDeduction)}</span>
                    <button type="button" onClick={() => clearScrapDeduction()} className="hover:text-destructive p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      ref={scrapDeductionInputRef}
                      type="text"
                      placeholder="Scrap # & Enter"
                      value={scrapDeductionSearchQuery}
                      onChange={e => setScrapDeductionSearchQuery(e.target.value.toUpperCase())}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const q = scrapDeductionSearchQuery.trim();
                          if (!q) return;
                          try {
                            const res = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: q }) as import('../../../data/scrap').ScrapInvoiceDetails | null;
                            if (res && res.totalAmount) {
                              if (res.paymentStatus === 'SETTLED') {
                                setHardwareError(`Scrap credit ${q} already redeemed.`);
                                return;
                              }
                              setScrapDeduction(res.totalAmount, q);
                              setScrapDeductionSearchQuery('');
                            } else {
                              setHardwareError(`Scrap invoice "${q}" not found`);
                            }
                          } catch {
                            setHardwareError('Failed to fetch scrap invoice');
                          }
                        }
                      }}
                      className="w-32 px-2.5 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                    />
                  </div>
                )
              )}

              {(isReturnModuleEnabled || storeReturnDeduction > 0) && (
                storeReturnDeduction > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Return: -{formatCurrency(storeReturnDeduction)}</span>
                    <button type="button" onClick={() => clearReturnDeduction()} className="hover:text-destructive p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      ref={returnDeductionInputRef}
                      type="text"
                      placeholder="Return # & Enter"
                      value={returnDeductionSearchQuery}
                      onChange={e => setReturnDeductionSearchQuery(e.target.value.toUpperCase())}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const q = returnDeductionSearchQuery.trim();
                          if (!q) return;
                          try {
                            const res = await returnsApi.getReturnInvoiceByNumber({ tenant_id: tenantId || '', return_number: q });
                            if (res && res.grand_total) {
                              const remaining = res.grand_total - (res.adjusted_amount || 0);
                              if (remaining > 0) {
                                setReturnDeduction(remaining, q);
                                setReturnDeductionSearchQuery('');
                              } else {
                                setHardwareError('Return already fully adjusted');
                              }
                            } else {
                              setHardwareError(`Return "${q}" not found`);
                            }
                          } catch {
                            setHardwareError('Failed to fetch return');
                          }
                        }
                      }}
                      className="w-32 px-2.5 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                    />
                  </div>
                )
              )}

              {isLoyaltyModuleEnabled && (
                pointsRedeemedDiscountCalc > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold">
                    <Coins className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Loyalty ({pointsRedeemedCalc} pts): -{formatCurrency(pointsRedeemedDiscountCalc)}</span>
                    <button type="button" onClick={() => { setPointsToRedeem(0); }} className="hover:text-destructive p-0.5 cursor-pointer" title="Remove Loyalty Discount">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={customerPointsBalance > 0 ? `Pts (Max ${customerPointsBalance})` : "Pts: 0"}
                      disabled={customerPointsBalance <= 0}
                      value={pointsToRedeem > 0 ? pointsToRedeem : ''}
                      onChange={e => {
                        const clean = e.target.value.replace(/\D/g, '');
                        const num = clean === '' ? 0 : Number(clean);
                        const val = Math.max(0, Math.min(num, customerPointsBalance));
                        setPointsToRedeem(clean === '' ? 0 : val);
                      }}
                      className="w-28 px-2 py-1 bg-background border border-border rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {customerPointsBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => setPointsToRedeem(customerPointsBalance)}
                        className="px-1.5 py-1 text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-md border border-emerald-500/20 cursor-pointer"
                      >
                        Max
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          )}

        </div>

        {/* Bottom Row: Totals, Old Balance, Settlement & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/20 px-3 py-2.5 rounded-xl border border-border">
          
          <div className="flex items-center gap-5 text-xs font-bold flex-wrap">
            {/* Old Balance */}
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Old Balance</div>
              <div className={clsx("font-mono font-black text-xs mt-0.5", partyBalance > 0 ? "text-rose-600" : "text-muted-foreground/80")}>
                {partyBalance > 0 ? `₹${partyBalance.toFixed(2)}` : '-'}
              </div>
            </div>

            <div className="h-7 w-px bg-border/80" />

            {/* Discount % */}
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Discount %</div>
              <input
                ref={discountRef}
                type="number"
                step="any"
                value={discountValue || ''}
                onChange={e => setDiscount(Number(e.target.value) || 0, 'PERCENTAGE')}
                placeholder="0.00 %"
                className="w-20 px-2 py-1 bg-background border border-border rounded font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="h-7 w-px bg-border/80" />

            {/* Cash Received */}
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Cash Recd</div>
              <input
                ref={receivedInputRef}
                type="number"
                step="any"
                value={receivedAmount || ''}
                onChange={e => updateActiveTab({ receivedAmount: Number(e.target.value) || 0 })}
                placeholder="0.00"
                className="w-24 px-2 py-1 bg-background border border-border rounded font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="h-7 w-px bg-border/80" />

            {/* Net Payable */}
            <div>
              <div className="flex items-center gap-1">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Net Payable</div>
                {isGrandTotalOverridden && (
                  <span className="text-[8px] font-extrabold text-amber-600 bg-amber-500/15 px-1 py-0.2 rounded">Overridden</span>
                )}
              </div>
              <div
                className="font-mono text-base font-black text-primary cursor-pointer hover:underline"
                onClick={startEditingTotal}
                title="Click to edit total"
              >
                ₹{displayGrandTotal.toFixed(2)}
              </div>
            </div>

            {/* Balance / Change */}
            <div>
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Balance / Change</div>
              <div className={clsx("font-mono font-bold text-xs mt-0.5", balanceAmount >= 0 ? "text-emerald-600" : "text-amber-600")}>
                ₹{Math.abs(balanceAmount).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCheckout(true)}
              disabled={isCheckingOut || items.length === 0}
              className="px-4 py-2.5 rounded-xl border-2 border-emerald-600/60 text-emerald-700 dark:text-emerald-400 font-black text-xs hover:bg-emerald-500/10 transition-all cursor-pointer shadow-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={() => handleCheckout()}
              disabled={isCheckingOut || items.length === 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 transition-all cursor-pointer shadow-md uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>PRINT (F12)</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
