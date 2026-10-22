import React from 'react';
import { User, Phone, MapPin, Building } from 'lucide-react';
import clsx from 'clsx';
import { CustomerOutstandingBadge } from '../ui/CustomerOutstandingBadge';
import { Select } from '../../ui/Select';
import { MRP_TIER_ID } from '../../../utils/pricingTierHelper';
import { SingleDatePicker } from '../../ui/SingleDatePicker';
import { INDIAN_STATES } from '../BillingConstants';
import type { PaymentMethod, SplitDetails, Tab } from '../../../store/tabStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { InvoiceType } from '../../../store/cartStore';
import type { CustomerSuggestion, MatchedParty } from '../customerDirectory';
import type { PricingTier } from '../../../utils/pricingTierHelper';
import type { CustomerFieldState } from '../hooks/useCustomerFieldState';
import type { CustomerFieldHandlers } from '../hooks/useCustomerFieldHandlers';

export interface BillingCustomerDetailsProps {
  activeTab: Tab | undefined;
  canOverrideTier: boolean;
  customerAddress: string;
  customerFields: CustomerFieldState;
  customerGstin: string;
  customerHandlers: CustomerFieldHandlers;
  customerName: string;
  customerPhone: string;
  customerState: string;
  displayGrandTotal: number;
  editingActive: string | null;
  enableThreeInvoiceSeries: boolean;
  filteredCustomerSuggestions: CustomerSuggestion[];
  findMatchingParty: (name?: string, phone?: string) => MatchedParty | null;
  handleInvoiceTypeChange: (type: "GST" | "BILL_OF_SUPPLY") => Promise<void>;
  handlePricingTierChange: (tierId: string) => void;
  invoiceType: InvoiceType;
  isB2B: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  loyaltyCustomerData: { customerId: string | null; pointsBalance: number; };
  loyaltyEnabled: boolean;
  onGstSeriesChange: (series: 'gst_b2c' | 'gst_b2b') => void;
  paymentMethod: PaymentMethod;
  pricingTiers: PricingTier[];
  receivedAmount: number;
  selectedTierId: string;
  setCustomerState: (state: string) => void;
  setLoyaltyCustomerData: React.Dispatch<React.SetStateAction<{ customerId: string | null; pointsBalance: number; }>>;
  splitDetails: SplitDetails;
  uiConfig: BillingUIConfig;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
}

export function BillingCustomerDetails({ activeTab, canOverrideTier, customerAddress, customerFields, customerGstin, customerHandlers, customerName, customerPhone, customerState, displayGrandTotal, editingActive, enableThreeInvoiceSeries, filteredCustomerSuggestions, findMatchingParty, handleInvoiceTypeChange, handlePricingTierChange, invoiceType, isB2B, isQuotationMode, isReturnMode, isScrapMode, loyaltyCustomerData, loyaltyEnabled, onGstSeriesChange, paymentMethod, pricingTiers, receivedAmount, selectedTierId, setCustomerState, setLoyaltyCustomerData, splitDetails, uiConfig, updateActiveTab }: BillingCustomerDetailsProps) {
  const { showCustomerDropdown, setShowCustomerDropdown, selectedCustomerIndex, setSelectedCustomerIndex, customerNameContainerRef, customerDropdownRef, customerNameInputRef, customerPhoneInputRef, customerAddressInputRef, customerGstinInputRef, skipCustomerDropdownOnFocusRef, customerListRef } = customerFields;
  const { selectCustomerSuggestion, handleCustomerNameKeyDown, handleCustomerPhoneKeyDown, handleCustomerAddressKeyDown, handleCustomerGstinKeyDown } = customerHandlers;
  return (
    <div className="px-4 py-2.5 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1" ref={customerNameContainerRef}>
          <User className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400')} />
          <input
            ref={customerNameInputRef}
            autoFocus={uiConfig.entryFocusOrder === 'customer-first'}
            placeholder={isB2B ? "Customer Name * [F4]" : "Customer Name [F4]"}
            value={customerName}
            onFocus={() => {
              if (!skipCustomerDropdownOnFocusRef.current && (customerName.trim() || customerPhone.trim())) {
                setShowCustomerDropdown(true);
              }
            }}
            onChange={e => {
              const val = e.target.value;
              if (!val.trim() && !customerPhone.trim()) {
                updateActiveTab({ customerId: '', customerName: '', customerAddress: '', customerGstin: '', isStaffCustomer: false, staffId: undefined });
                setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
                setShowCustomerDropdown(false);
              } else {
                updateActiveTab({ customerName: val });
                setShowCustomerDropdown(true);
                setSelectedCustomerIndex(0);
              }
            }}
            onKeyDown={handleCustomerNameKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              paymentMethod === 'CREDIT'
                ? 'border-amber-400 bg-amber-500/5 dark:bg-amber-950/30 dark:border-amber-500/60 focus:ring-amber-500/30 focus:border-amber-500'
                : (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerName.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
          {activeTab?.isStaffCustomer && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800 pointer-events-none select-none">
              STAFF
            </span>
          )}
          {showCustomerDropdown && (customerName.trim() || customerPhone.trim()) && filteredCustomerSuggestions.length > 0 && (
            <div ref={customerDropdownRef} className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div ref={customerListRef} className="max-h-[220px] overflow-y-auto divide-y divide-border/60 custom-scrollbar">
                {filteredCustomerSuggestions.slice(0, 15).map((c, index) => (
                  <button
                    key={c.is_staff ? `staff-${c.staff_id || index}` : (c.customer_id || c.party_id || c.phone || index)}
                    data-customer-index={index}
                    type="button"
                    onClick={() => selectCustomerSuggestion(c)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border dark:border-slate-800 last:border-0 cursor-pointer transition-colors",
                      index === selectedCustomerIndex
                        ? "bg-primary/15 text-primary font-bold dark:bg-primary/25"
                        : "hover:bg-muted/60 dark:hover:bg-slate-800/60"
                    )}
                  >
                    {c.is_staff ? (
                      <div className="w-5 h-5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <User className={clsx("w-4 h-4 shrink-0 transition-colors", index === selectedCustomerIndex ? "text-primary dark:text-blue-300" : "text-muted-foreground dark:text-gray-400")} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx("text-xs font-bold truncate transition-colors", index === selectedCustomerIndex ? "text-primary dark:text-blue-300" : "text-slate-900 dark:text-gray-100")}>{c.name}</span>
                        {c.is_staff && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black tracking-wider uppercase bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            STAFF
                          </span>
                        )}
                      </div>
                      <div className={clsx("text-[10px] transition-colors", index === selectedCustomerIndex ? "text-primary/80 dark:text-blue-300/80" : "text-muted-foreground dark:text-gray-400")}>
                        {c.is_staff
                          ? [c.staff_code ? `Code: ${c.staff_code}` : null, c.role_designation, c.phone].filter(Boolean).join(' • ')
                          : (c.phone || c.address || 'No phone/address')}
                      </div>
                    </div>
                    {!c.is_staff && Number(c.current_points_balance) > 0 && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{Number(c.current_points_balance).toFixed(0)} pts</span>
                    )}
                    {c.balance != null && Number(c.balance) !== 0 && (
                      <span className={clsx("text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded", Number(c.balance) > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                        {c.is_staff ? (Number(c.balance) < 0 ? `Owes: ₹${Math.abs(Number(c.balance)).toFixed(2)}` : `Bal: ₹${Number(c.balance).toFixed(2)}`) : `Bal: ₹${Math.abs(Number(c.balance)).toFixed(2)}`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative flex-1 min-w-0">
          <Phone className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-all duration-300', paymentMethod === 'CREDIT' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400')} />
          <input
            ref={customerPhoneInputRef}
            placeholder={isB2B ? "Phone *" : "Phone Number"}
            value={customerPhone}
            onFocus={() => {
              if (!skipCustomerDropdownOnFocusRef.current && (customerName.trim() || customerPhone.trim())) {
                setShowCustomerDropdown(true);
              }
            }}
            onChange={e => {
              const val = e.target.value;
              if (!val.trim() && !customerName.trim()) {
                updateActiveTab({ customerId: '', customerPhone: '', customerAddress: '', customerGstin: '', isStaffCustomer: false, staffId: undefined });
                setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
                setShowCustomerDropdown(false);
              } else {
                updateActiveTab({ customerPhone: val });
                setShowCustomerDropdown(true);
                setSelectedCustomerIndex(0);
              }
            }}
            onKeyDown={handleCustomerPhoneKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              paymentMethod === 'CREDIT'
                ? 'border-amber-400 bg-amber-500/5 dark:bg-amber-950/30 dark:border-amber-500/60 focus:ring-amber-500/30 focus:border-amber-500'
                : (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerPhone.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
        </div>
        <CustomerOutstandingBadge partyObj={(() => {
          const p = findMatchingParty(customerName, customerPhone);
          if (!p) return null;
          const key = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
          const isStaff = String(p.party_type || '').toUpperCase() === 'STAFF';
          const contribution = editingActive && !isStaff && activeTab?.editingInvoicePartyKey === key
            ? (Number(activeTab?.editingInvoiceContribution) || 0)
            : 0;
          return { name: p.name, phone: p.phone, balance: (Number(p.balance) || 0) - contribution };
        })()} />
        {loyaltyEnabled && !isScrapMode && !isQuotationMode && (loyaltyCustomerData.customerId || (customerPhone && customerPhone.trim())) && (
          <div className="flex items-center shrink-0">
            <div
              className="h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 shadow-2xs whitespace-nowrap"
              title={`Customer Loyalty Balance: ${(Number(loyaltyCustomerData?.pointsBalance) || 0).toFixed(0)} points`}
            >
              <span className="font-extrabold text-[11px] uppercase tracking-wider opacity-90">Points:</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-2xs">
                {(Number(loyaltyCustomerData?.pointsBalance) || 0).toFixed(0)} pts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Credit Limit Warning Banner */}
      {(() => {
        if (paymentMethod !== 'CREDIT' && !(paymentMethod === 'SPLIT' && Number(splitDetails.credit) > 0)) return null;
        const party = findMatchingParty(customerName, customerPhone);
        if (!party || !(Number(party.credit_limit) > 0)) return null;
        const limit = Number(party.credit_limit);
        const key = `${(customerName || '').trim().toLowerCase()}|${(customerPhone || '').trim()}`;
        const isStaff = String(party.party_type || '').toUpperCase() === 'STAFF';
        const editingContribution = editingActive && !isStaff && activeTab?.editingInvoicePartyKey === key
          ? (Number(activeTab?.editingInvoiceContribution) || 0)
          : 0;
        const currentBal = (Number(party.balance) || 0) - editingContribution;
        const splitPaid = (Number(splitDetails.cash) || 0)
          + (Number(splitDetails.card) || 0)
          + (Number(splitDetails.upi) || 0)
          + (Number(splitDetails.cheque) || 0)
          + (Number(splitDetails.bank_transfer) || 0);
        const billCredit = paymentMethod === 'CREDIT'
          ? Math.max(0, displayGrandTotal - (Number(receivedAmount) || 0))
          : Math.max(0, displayGrandTotal - splitPaid);
        const projected = currentBal + billCredit;
        const available = Math.max(0, limit - currentBal);
        const exceeded = projected > limit;
        const excess = exceeded ? projected - limit : 0;
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div className={`mb-2 rounded-xl px-3 py-2 border text-xs flex flex-col gap-1 transition-all duration-300 ${
            exceeded
              ? 'border-red-400 bg-red-500/10 text-red-700 dark:text-red-400'
              : 'border-amber-400 bg-amber-500/8 text-amber-700 dark:text-amber-400'
          }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold flex items-center gap-1">
                {exceeded ? '🚫' : '💳'} Credit Limit: ₹{fmtN(limit)}
              </span>
              <span className="font-semibold">Current Bal: ₹{fmtN(currentBal)}</span>
              <span className="font-semibold">Bill Credit: ₹{fmtN(billCredit)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-current/20 pt-1 font-extrabold">
              <span>Projected Total: ₹{fmtN(projected)}</span>
              {exceeded ? (
                <span className="text-red-600 dark:text-red-300 underline">EXCEEDS LIMIT BY ₹{fmtN(excess)}!</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400">Available: ₹{fmtN(available - billCredit)}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Real-time Credit Period & Overdue Status Warning Banner */}
      {(() => {
        const party = findMatchingParty(customerName, customerPhone);
        if (!party || !(party as any).credit_period_enabled) return null;
        const isCreditTx = paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && Number(splitDetails.credit) > 0);
        const hasOverdue = Boolean((party as any).has_overdue);
        const isRestricted = (party as any).restrict_on_credit_expiry !== false && (party as any).restrict_on_credit_expiry !== 0;
        const overdueCount = (party as any).overdue_bills_count || 0;
        const overdueAmt = Number((party as any).overdue_amount || 0);
        const creditDays = (party as any).credit_period_days || 30;
        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (hasOverdue) {
          return (
            <div className={`mb-2 rounded-xl px-3 py-2 border text-xs flex flex-col gap-1 transition-all duration-300 ${
              isCreditTx && isRestricted
                ? 'border-rose-500 bg-rose-500/15 text-rose-800 dark:text-rose-300 shadow-xs'
                : 'border-amber-400 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-extrabold flex items-center gap-1">
                  ⚠️ Overdue Payment Alert ({overdueCount} bill{overdueCount !== 1 ? 's' : ''})
                </span>
                <span className="font-mono font-bold">Total Overdue: ₹{fmtN(overdueAmt)}</span>
              </div>
              <p className="text-[11px] font-semibold leading-snug">
                {isCreditTx && isRestricted ? (
                  <span className="text-rose-700 dark:text-rose-400 font-extrabold">
                    🚫 Further credit purchases are restricted for this customer until overdue bills are settled. Switch to Cash/Card/UPI.
                  </span>
                ) : (
                  <span>
                    Customer has {overdueCount} bill(s) past the {creditDays}-day credit period. {isCreditTx ? 'Credit purchase is permitted under owner policy.' : ''}
                  </span>
                )}
              </p>
            </div>
          );
        }

        if (isCreditTx) {
          const projectedDueDate = new Date();
          projectedDueDate.setDate(projectedDueDate.getDate() + creditDays);
          const dueStr = projectedDueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <div className="mb-2 rounded-xl px-3 py-1.5 border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-between gap-2">
              <span className="font-bold flex items-center gap-1">
                ⏳ Credit Period: {creditDays} Days
              </span>
              <span className="font-mono font-semibold text-[11px]">Payment Due By: {dueStr}</span>
            </div>
          );
        }

        return null;
      })()}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          <input
            ref={customerAddressInputRef}
            placeholder={isB2B ? "Customer Address *" : "Customer Address"}
            value={customerAddress}
            onChange={e => updateActiveTab({ customerAddress: e.target.value })}
            onKeyDown={handleCustomerAddressKeyDown}
            className={clsx(
              'w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-sm text-foreground font-semibold placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300',
              (isB2B && !isQuotationMode && !isReturnMode && !isScrapMode && !customerAddress.trim())
                ? 'border-rose-400 dark:border-rose-700 focus:ring-rose-500/20 focus:border-rose-500'
                : 'border-border focus:ring-primary/20 focus:border-primary'
            )}
          />
        </div>
        {pricingTiers.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Select
              size="sm"
              triggerClassName="h-auto py-2"
              className="w-40 sm:w-44"
              value={selectedTierId}
              onChange={v => { if (canOverrideTier) handlePricingTierChange(v); }}
              options={pricingTiers.map(t => {
                const isMrp = t.is_mrp || t.pricing_tier_id === '' || t.pricing_tier_id === MRP_TIER_ID;
                const labelText = isMrp ? 'MRP' : t.name;
                const isDefault = t.is_default === 1 || t.is_default === true || t.is_default === '1';
                return {
                  value: isMrp ? '' : t.pricing_tier_id,
                  label: isDefault ? `⭐ ${labelText}` : labelText
                };
              })}
              disabled={!canOverrideTier}
            />
            {!canOverrideTier && (
              <span className="text-[10px] text-muted-foreground shrink-0" title="Owner has disabled biller price overrides">🔒 locked</span>
            )}
          </div>
        )}
        <SingleDatePicker
          value={activeTab?.billDate}
          onChange={val => updateActiveTab({ billDate: val })}
          isEditing={Boolean(editingActive)}
          align="right"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
          <button
            onClick={() => handleInvoiceTypeChange('BILL_OF_SUPPLY')}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
              invoiceType === 'BILL_OF_SUPPLY'
                ? 'bg-card text-foreground shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Bill of Supply
          </button>
          <button
            onClick={() => handleInvoiceTypeChange('GST')}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
              invoiceType === 'GST'
                ? 'bg-card text-foreground shadow-sm border border-border/20'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            GST Invoice
          </button>
        </div>
        {invoiceType === 'GST' && (
          <div className="flex items-center gap-2 flex-1">
              <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    updateActiveTab({ isB2B: false, customerGstin: '' });
                    if (enableThreeInvoiceSeries) {
                      onGstSeriesChange('gst_b2c');
                    }
                  }}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap',
                    !isB2B
                      ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="B2C Consumer GST Invoice (Customer Name, Phone & Address optional)"
                >
                  B2C
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateActiveTab({ isB2B: true });
                    if (enableThreeInvoiceSeries) {
                      onGstSeriesChange('gst_b2b');
                    }
                    setTimeout(() => customerGstinInputRef.current?.focus(), 50);
                  }}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap',
                    isB2B
                      ? 'bg-card text-blue-600 dark:text-blue-400 shadow-sm border border-border/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="B2B Business Tax Invoice (Customer Name, Phone, Address & GSTIN required)"
                >
                  B2B
                </button>
              </div>
              <div className="flex-1">
                <Select size="sm" triggerClassName="h-auto" value={customerState} onChange={setCustomerState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} className="w-full" />
              </div>
              <div className="relative flex-1">
                <Building className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input
                  ref={customerGstinInputRef}
                  placeholder={isB2B ? "GSTIN *" : "GSTIN (optional)"}
                  value={customerGstin}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    updateActiveTab({ customerGstin: val, isB2B: Boolean(val.trim()) || isB2B });
                  }}
                  onKeyDown={handleCustomerGstinKeyDown}
                  maxLength={15}
                  className={clsx(
                    "w-full pl-7 pr-2 py-1 bg-background border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 uppercase",
                    (isB2B && !customerGstin.trim())
                      ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500/20"
                      : "border-border focus:ring-primary/20"
                  )}
                />
              </div>
          </div>
        )}
      </div>
    </div>
  );
}
