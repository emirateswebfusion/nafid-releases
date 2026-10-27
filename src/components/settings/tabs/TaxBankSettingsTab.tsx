import clsx from 'clsx';
import React from 'react';
import { Building, Landmark, TrendingUp, Smartphone } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { INDIAN_STATES } from '../settingsUtils';
import type { SettingsForm } from '../settingsFormTypes';

export interface TaxBankSettingsTabProps {
  shopGstin: string; setShopGstin: (v: string) => void;
  shopState: string; setShopState: (v: string) => void;
  gstProfitPercentage: number | string; setGstProfitPercentage: SettingsForm['setGstProfitPercentage'];
  gstConversionTaxInclusive: boolean; setGstConversionTaxInclusive: (v: boolean) => void;
  bankName: string; setBankName: (v: string) => void;
  bankAccount: string; setBankAccount: (v: string) => void;
  bankIfsc: string; setBankIfsc: (v: string) => void;
  bankBranch: string; setBankBranch: (v: string) => void;
  upiId: string; setUpiId: (v: string) => void;
  showUpiQr: boolean; setShowUpiQr: (v: boolean) => void;
}

/** Tax, Bank & UPI: GST registration and conversion, bank account and UPI details printed on bills. */
export const TaxBankSettingsTab: React.FC<TaxBankSettingsTabProps> = ({
  shopGstin, setShopGstin,
  shopState, setShopState,
  gstProfitPercentage, setGstProfitPercentage,
  gstConversionTaxInclusive, setGstConversionTaxInclusive,
  bankName, setBankName,
  bankAccount, setBankAccount,
  bankIfsc, setBankIfsc,
  bankBranch, setBankBranch,
  upiId, setUpiId,
  showUpiQr, setShowUpiQr,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 2: GST & Taxation */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-emerald-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.1)] dark:shadow-[0_4px_12px_rgba(16,185,129,0.05)] shrink-0">
                  <Building className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">GST &amp; Taxation</span>
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop GSTIN</label>
                    <Input type="text" maxLength={15} value={shopGstin} onChange={(e) => setShopGstin(e.target.value.toUpperCase())} placeholder="e.g. 27AAAAA1111A1Z1" className="uppercase font-semibold font-mono bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">State (Place of Business)</label>
                    <Select value={shopState} onChange={setShopState} options={INDIAN_STATES.map(s => ({value:s.code,label:s.name+' ('+s.code+')'}))} />
                  </div>
                </div>
                <div className="rounded-2xl border border-border p-5 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-border">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-foreground">Bill of Supply → GST Conversion</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">
                        Profit Percentage Margin
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input type="number" min="0" max="999" value={gstProfitPercentage}
                            onChange={e => setGstProfitPercentage(e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono" />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">GST sale price = GST purchase price + this % margin. Used when converting Bill of Supply invoices to GST Invoices.</p>
                    </div>

                    <div className="space-y-2 col-span-2 pt-2 border-t border-border/50">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">
                        Default GST Conversion Pricing Mode
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setGstConversionTaxInclusive(false)}
                          className={clsx(
                            'flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer',
                            !gstConversionTaxInclusive
                              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                              : 'bg-background border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                          )}
                        >
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            Tax Exclusive (+ GST)
                          </span>
                          <span className="text-[10px] opacity-75 mt-0.5 leading-normal">
                            Sale price + GST on top. (Grand Total = Base + GST).
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGstConversionTaxInclusive(true)}
                          className={clsx(
                            'flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer',
                            gstConversionTaxInclusive
                              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                              : 'bg-background border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                          )}
                        >
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            Tax Inclusive (MRP / Included)
                          </span>
                          <span className="text-[10px] opacity-75 mt-0.5 leading-normal">
                            Sale price already includes GST. Grand Total stays identical to BOS invoice.
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2.5: Bank Account Details */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-indigo-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 shadow-[0_4px_12px_rgba(99,102,241,0.1)] dark:shadow-[0_4px_12px_rgba(99,102,241,0.05)] shrink-0">
                  <Landmark className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Bank Account Details</span>
              </div>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Bank Name</label>
                    <Input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. ICICI Bank / State Bank of India" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Account Number</label>
                    <Input type="text" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. 5010023456789" className="font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">IFSC Code</label>
                    <Input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="e.g. ICIC0001234" className="uppercase font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Branch</label>
                    <Input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="e.g. Main Branch, MG Road" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Bank details are printed on tax invoices and A4 GST bills for customer wire transfers.</p>
              </div>
            </div>

            {/* UPI Payments */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Smartphone className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">UPI Payments</span>
              </div>
              <div className="space-y-5">
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>UPI ID</span>
                    <span className="text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full lowercase">Shown on receipts</span>
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50" />
                    <Input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shopname@upi" className="pl-11 font-mono font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">This UPI ID will appear on printed receipts for customer payments.</p>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setShowUpiQr(!showUpiQr)}>Show UPI QR Code on Receipt</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">When enabled, a QR code with the bill amount pre-filled will appear on printed receipts.</p>
                  </div>
                  <button type="button" onClick={() => setShowUpiQr(!showUpiQr)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', showUpiQr ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', showUpiQr ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>
              </div>
            </div>
          </div>
  );
};
