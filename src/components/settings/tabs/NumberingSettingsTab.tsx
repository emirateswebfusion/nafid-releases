import clsx from 'clsx';
import React from 'react';
import { Receipt } from 'lucide-react';
import { Input } from '../../ui/Input';
import type { SettingsForm } from '../settingsFormTypes';

export interface NumberingSettingsTabProps {
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

/** Invoice Numbering: terminal code and every document counter (invoice, B2B/B2C, scrap, quotation, return, purchase). */
export const NumberingSettingsTab: React.FC<NumberingSettingsTabProps> = ({
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
