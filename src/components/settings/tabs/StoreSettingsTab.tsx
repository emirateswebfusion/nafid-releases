import clsx from 'clsx';
import React from 'react';
import { QrCode, Building, Landmark, Receipt, TrendingUp, Check, Copy, Smartphone } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { INDIAN_STATES } from '../settingsUtils';
import { SUPPORTED_TIMEZONES, setStoreTimezone } from '../../../utils/timezoneHelper';
import type { SettingsForm } from '../settingsFormTypes';

export interface StoreSettingsTabProps {
  connectCode: string;
  copiedCode: boolean;
  setCopiedCode: (v: boolean) => void;
  shopNameLocal: string; setShopNameLocal: (v: string) => void;
  shopAddress: string; setShopAddress: (v: string) => void;
  shopPhone: string; setShopPhone: (v: string) => void;
  shopEmail: string; setShopEmail: (v: string) => void;
  shopWebsite: string; setShopWebsite: (v: string) => void;
  shopGstin: string; setShopGstin: (v: string) => void;
  shopState: string; setShopState: (v: string) => void;
  gstProfitPercentage: number | string; setGstProfitPercentage: SettingsForm['setGstProfitPercentage'];
  gstConversionTaxInclusive: boolean; setGstConversionTaxInclusive: (v: boolean) => void;
  storeTimezone: string; setStoreTimezoneState: (v: string) => void;
  bankName: string; setBankName: (v: string) => void;
  bankAccount: string; setBankAccount: (v: string) => void;
  bankIfsc: string; setBankIfsc: (v: string) => void;
  bankBranch: string; setBankBranch: (v: string) => void;
  upiId: string; setUpiId: (v: string) => void;
  showUpiQr: boolean; setShowUpiQr: (v: boolean) => void;
  terminalCode: string; setTerminalCode: (v: string) => void;
  invoiceStartNumber: number | string; setInvoiceStartNumber: SettingsForm['setInvoiceStartNumber'];
  enableThreeInvoiceSeries: boolean; setEnableThreeInvoiceSeries: (v: boolean) => void;
  b2bPrefix: string; setB2bPrefix: (v: string) => void;
  b2bStartNumber: number | string; setB2bStartNumber: SettingsForm['setB2bStartNumber'];
  b2cPrefix: string; setB2cPrefix: (v: string) => void;
  b2cStartNumber: number | string; setB2cStartNumber: SettingsForm['setB2cStartNumber'];
  returnPrefix: string; setReturnPrefix: (v: string) => void;
  returnStartNumber: number | string; setReturnStartNumber: SettingsForm['setReturnStartNumber'];
  scrapPrefix: string; setScrapPrefix: (v: string) => void;
  scrapStartNumber: number | string; setScrapStartNumber: SettingsForm['setScrapStartNumber'];
  quotationPrefix: string; setQuotationPrefix: (v: string) => void;
  quotationStartNumber: number | string; setQuotationStartNumber: SettingsForm['setQuotationStartNumber'];
  purchaseBillPrefix: string; setPurchaseBillPrefix: (v: string) => void;
  purchaseBillStartNumber: number | string; setPurchaseBillStartNumber: SettingsForm['setPurchaseBillStartNumber'];
}

export const StoreSettingsTab: React.FC<StoreSettingsTabProps> = ({
  connectCode, copiedCode, setCopiedCode,
  shopNameLocal, setShopNameLocal,
  shopAddress, setShopAddress,
  shopPhone, setShopPhone,
  shopEmail, setShopEmail,
  shopWebsite, setShopWebsite,
  shopGstin, setShopGstin,
  shopState, setShopState,
  gstProfitPercentage, setGstProfitPercentage,
  gstConversionTaxInclusive, setGstConversionTaxInclusive,
  storeTimezone, setStoreTimezoneState,
  bankName, setBankName,
  bankAccount, setBankAccount,
  bankIfsc, setBankIfsc,
  bankBranch, setBankBranch,
  upiId, setUpiId,
  showUpiQr, setShowUpiQr,
  terminalCode, setTerminalCode,
  invoiceStartNumber, setInvoiceStartNumber,
  enableThreeInvoiceSeries, setEnableThreeInvoiceSeries,
  b2bPrefix, setB2bPrefix,
  b2bStartNumber, setB2bStartNumber,
  b2cPrefix, setB2cPrefix,
  b2cStartNumber, setB2cStartNumber,
  returnPrefix, setReturnPrefix,
  returnStartNumber, setReturnStartNumber,
  scrapPrefix, setScrapPrefix,
  scrapStartNumber, setScrapStartNumber,
  quotationPrefix, setQuotationPrefix,
  quotationStartNumber, setQuotationStartNumber,
  purchaseBillPrefix, setPurchaseBillPrefix,
  purchaseBillStartNumber, setPurchaseBillStartNumber,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 0: Nafid Connect Code Card */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 rounded-[28px] p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Nafid Connect Code</span>
                      <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">Peer Sync Active</span>
                    </div>
                    <h3 className="text-2xl font-black font-mono tracking-wider text-foreground mt-1">
                      {connectCode || 'Loading...'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share this unique code with counterparty shops or customers to link ledgers & auto-sync transactions in real time.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (connectCode) {
                      navigator.clipboard.writeText(connectCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? 'Copied to Clipboard!' : 'Copy Connect Code'}
                </button>
              </div>
            </div>

            {/* Card 1: Shop Profile */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] dark:shadow-[0_4px_12px_rgba(79,70,229,0.05)] shrink-0">
                  <Building className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-foreground uppercase tracking-widest">Shop Details</span>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Name</label>
                  <Input type="text" value={shopNameLocal} onChange={(e) => setShopNameLocal(e.target.value)} placeholder="Your business name" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <Input type="text" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="e.g. +91 98765 43210" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Email Address (E-Mail)</label>
                  <Input type="email" value={shopEmail} onChange={(e) => setShopEmail(e.target.value)} placeholder="e.g. info@business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Website URL (Web)</label>
                  <Input type="text" value={shopWebsite} onChange={(e) => setShopWebsite(e.target.value)} placeholder="e.g. www.business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Address</label>
                  <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Enter your business address..." rows={3} className="w-full bg-background/50 border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>Store Location & Timezone</span>
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">UTC + Store Timezone Standard</span>
                  </label>
                  <Select
                    value={storeTimezone}
                    onChange={(val) => {
                      setStoreTimezoneState(val);
                      setStoreTimezone(val);
                    }}
                    options={SUPPORTED_TIMEZONES}
                  />
                  <p className="text-[10px] text-muted-foreground/75 mt-1">
                    Store business dates, cashier settlement, receipts, and daily sales reports are formatted based on this store timezone. Remote owners viewing from other countries will see reports calculated for this store timezone.
                  </p>
                </div>
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

            {/* Card 3: Invoice Counter & Series */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-blue-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.1)] dark:shadow-[0_4px_12px_rgba(59,130,246,0.05)] shrink-0">
                  <Receipt className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Invoice Counters</span>
                <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border/50 text-[10px] font-mono font-bold text-foreground">
                  <span>{terminalCode || 'POS1'}-{String(Number(invoiceStartNumber) || 1).padStart(3, '0')}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">NEXT</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>Terminal Code</span>
                    <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Per computer</span>
                  </label>
                  <Input type="text" value={terminalCode} onChange={(e) => {
                    const newCode = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                    setTerminalCode(newCode);
                    if (newCode) {
                      setScrapPrefix(`${newCode}-SCR`);
                      setQuotationPrefix(`${newCode}-QTN`);
                      setReturnPrefix(`${newCode}-RTN`);
                      setPurchaseBillPrefix(`${newCode}-PUR`);
                    }
                  }} placeholder="Auto-generated" className="font-mono font-bold uppercase tracking-wider bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" maxLength={6} />
                  <p className="text-[10px] text-muted-foreground/70 mt-1">Format: <span className="font-mono text-foreground/80">{terminalCode || 'POS1'}-XXX</span></p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Starting Number</label>
                  <Input type="number" min="1" value={invoiceStartNumber} onChange={(e) => setInvoiceStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
              </div>

              {/* 3 Invoice Series Block */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-purple-500 uppercase tracking-widest">3 Invoice Series</span>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Separate counters for B2B &amp; B2C GST invoices</p>
                  </div>
                  <button type="button" onClick={() => setEnableThreeInvoiceSeries(!enableThreeInvoiceSeries)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enableThreeInvoiceSeries ? 'bg-purple-500 shadow-[0_2px_8px_rgba(168,85,247,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enableThreeInvoiceSeries ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {enableThreeInvoiceSeries && (
                  <div className="space-y-4 pt-2">
                    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          GST B2B Invoice Series
                        </h5>
                        <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{b2bPrefix || 'B2B'}-{String(Number(b2bStartNumber) || 1).padStart(3, '0')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                          <Input type="text" value={b2bPrefix} onChange={(e) => setB2bPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" maxLength={6} placeholder="e.g. B2B" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                          <Input type="number" min="1" value={b2bStartNumber} onChange={(e) => setB2bStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          GST B2C Invoice Series
                        </h5>
                        <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{b2cPrefix || 'B2C'}-{String(Number(b2cStartNumber) || 1).padStart(3, '0')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                          <Input type="text" value={b2cPrefix} onChange={(e) => setB2cPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl" maxLength={6} placeholder="e.g. B2C" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                          <Input type="number" min="1" value={b2cStartNumber} onChange={(e) => setB2cStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scrap Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-orange-500 uppercase tracking-widest">Scrap Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for scrap invoices</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                        Scrap Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{scrapPrefix || `${terminalCode}-SCR`}-{String(Number(scrapStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={scrapPrefix || `${terminalCode}-SCR`} onChange={(e) => setScrapPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-orange-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={scrapStartNumber} onChange={(e) => setScrapStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-orange-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quotation Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Quotation Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for quotations</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        Quotation Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{quotationPrefix || `${terminalCode}-QTN`}-{String(Number(quotationStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={quotationPrefix || `${terminalCode}-QTN`} onChange={(e) => setQuotationPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={quotationStartNumber} onChange={(e) => setQuotationStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-blue-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Return Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-rose-500 uppercase tracking-widest">Return Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and starting number for return invoices</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        Return Invoice Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">{returnPrefix || `${terminalCode}-RTN`}-{String(Number(returnStartNumber) || 1).padStart(3, '0')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input type="text" value={returnPrefix || `${terminalCode}-RTN`} onChange={(e) => setReturnPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))} className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-rose-500/10 rounded-xl" maxLength={12} placeholder="Auto-generated" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Starting Number</label>
                        <Input type="number" min="1" value={returnStartNumber} onChange={(e) => setReturnStartNumber(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 1" className="font-mono font-bold bg-background focus:ring-4 focus:ring-rose-500/10 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Purchase Bill Counter */}
              <div className="mt-6 border-t border-border/40 pt-6 space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">Purchase Bill Counter</span>
                  <p className="text-[10px] text-muted-foreground/75 mt-0.5">Prefix and next starting number for purchase bills</p>
                </div>
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        Purchase Bill Series
                      </h5>
                      <span className="text-[10px] font-mono font-bold text-foreground bg-background border border-border px-2 py-0.5 rounded-lg">
                        {purchaseBillPrefix || `${terminalCode}-PUR`}-{String(Number(purchaseBillStartNumber) || 1).padStart(3, '0')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Prefix</label>
                        <Input
                          type="text"
                          value={purchaseBillPrefix || `${terminalCode}-PUR`}
                          onChange={(e) => setPurchaseBillPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))}
                          className="font-mono font-bold uppercase bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl"
                          maxLength={12}
                          placeholder="Auto-generated"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Next Number</label>
                        <Input
                          type="number"
                          min="1"
                          value={purchaseBillStartNumber}
                          onChange={(e) => setPurchaseBillStartNumber(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g. 1"
                          className="font-mono font-bold bg-background focus:ring-4 focus:ring-emerald-500/10 rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
  );
};
