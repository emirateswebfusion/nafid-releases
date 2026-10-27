import { Modal } from '../../ui/Modal';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { ArrowDownRight, CheckCircle2, AlertCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { useAuthStore } from '../../../store/authStore';
import { isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import type { Dispatch, SetStateAction } from 'react';
import type { SalesInvoiceRow } from '../salesTypes';

export interface ConversionModalProps {
  conversionDeductionsTotal: number;
  conversionOpen: boolean;
  conversionPreview: { total_bos_amount?: number; total_taxable_amount?: number; total_tax_amount?: number; total_converted_amount?: number; has_real_gst?: boolean; has_paper?: boolean; has_skipped?: boolean; invoices?: { invoice_id: string; invoice_number: string; bos_grand_total: number; taxable_amount?: number; tax_amount?: number; converted_grand_total: number; points_discount?: number; scrap_deduction?: number; return_deduction?: number; deductions_total?: number; has_real_gst: boolean; has_paper: boolean; skipped_items: string[]; }[]; } | null;
  conversionPreviewLoading: boolean;
  conversionResults: { invoice_id: string; old_number: string | null; new_number: string; success: boolean; error?: string; skipped_items?: string[]; }[] | null;
  conversionTaxMode: "EXCLUSIVE" | "INCLUSIVE";
  converting: boolean;
  loadInvoices: (reset?: boolean) => Promise<void>;
  selectedBosInvoices: SalesInvoiceRow[];
  setConversionOpen: Dispatch<SetStateAction<boolean>>;
  setConversionResults: Dispatch<SetStateAction<{ invoice_id: string; old_number: string | null; new_number: string; success: boolean; error?: string; skipped_items?: string[]; }[] | null>>;
  setConversionTaxMode: Dispatch<SetStateAction<"EXCLUSIVE" | "INCLUSIVE">>;
  setConverting: Dispatch<SetStateAction<boolean>>;
  setSelectedInvoiceIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  showToast: (text: string, type: "success" | "error") => void;
}

/** Convert selected Bills of Supply to GST invoices: per-bill preview in the chosen tax mode, confirm, then the results. */
export function ConversionModal({
  conversionDeductionsTotal, conversionOpen, conversionPreview, conversionPreviewLoading, conversionResults,
  conversionTaxMode, converting, loadInvoices, selectedBosInvoices, setConversionOpen, setConversionResults,
  setConversionTaxMode, setConverting, setSelectedInvoiceIds, setSelectionMode, showToast,
}: ConversionModalProps) {
  return (
    <Modal
      isOpen={conversionOpen}
      onClose={() => { if (!converting) { setConversionOpen(false); } }}
      closeButton={<RedCrossButton onClick={() => { if (!converting) { setConversionOpen(false); } }} />}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <ArrowDownRight className="w-5 h-5 text-amber-500" />
          <span>Convert to GST Invoice</span>
        </div>
      }
    >
      <div className="space-y-4 min-w-[480px] text-foreground">
        {conversionResults ? (
          <>
            <div className={clsx(
              'p-4 rounded-2xl border flex items-start gap-3',
              conversionResults.every(r => r.success)
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
            )}>
              {conversionResults.every(r => r.success)
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-sm font-bold">
                  {conversionResults.filter(r => r.success).length} of {conversionResults.length} invoice{conversionResults.length !== 1 ? 's' : ''} converted successfully
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {conversionResults.filter(r => r.success).map(r => `${r.old_number} → ${r.new_number}`).join(', ')}
                </p>
              </div>
            </div>

            {conversionResults.some(r => !r.success) && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Failed conversions</p>
                {conversionResults.filter(r => !r.success).map(r => (
                  <div key={r.invoice_id} className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs">
                    <span className="font-bold text-red-500">Invoice {r.old_number || r.invoice_id}:</span> {r.error}
                  </div>
                ))}
              </div>
            )}

            {conversionResults.filter(r => r.success && r.skipped_items?.length).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Items skipped (no GST purchase record)</p>
                {conversionResults.filter(r => r.success && r.skipped_items?.length).map(r => (
                  <div key={r.invoice_id} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs space-y-1">
                    <p className="font-bold text-amber-600 dark:text-amber-400">{r.old_number} → {r.new_number}</p>
                    <p className="text-muted-foreground">{r.skipped_items!.join(', ')}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setConversionOpen(false);
                  setConversionResults(null);
                  setSelectedInvoiceIds(new Set());
                  setSelectionMode(false);
                  loadInvoices(true);
                }}
                className="h-10 px-6 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-150 active:scale-95 cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Confirm Conversion ({selectedBosInvoices.length} Bill{selectedBosInvoices.length !== 1 ? 's' : ''})</span>
                </p>
                {conversionPreviewLoading && (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                    Calculating...
                  </span>
                )}
              </div>

              <div className="text-xs space-y-1.5 leading-relaxed">
                {conversionPreview?.has_real_gst && (
                  <div className="flex items-start gap-2 text-foreground/90 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl">
                    <span className="text-emerald-500 font-black text-xs shrink-0">✓ Real GST Products:</span>
                    <span className="text-[11.5px]">
                      {conversionTaxMode === 'EXCLUSIVE'
                        ? 'Original BoS price is used as Base price, and GST is added on top (Base + GST).'
                        : 'Original BoS price is maintained as the Total MRP (GST included inside).'}
                    </span>
                  </div>
                )}

                {conversionPreview?.has_paper && (
                  <div className="flex items-start gap-2 text-foreground/90 font-medium bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-xl">
                    <span className="text-purple-500 font-black text-xs shrink-0">📄 Paper Products:</span>
                    <span className="text-[11.5px]">Prices will use their designated Paper MRP / purchase figures.</span>
                  </div>
                )}

                {conversionPreview?.has_skipped && (
                  <div className="flex items-start gap-2 text-foreground/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl">
                    <span className="text-amber-500 font-black text-xs shrink-0">⚠️ Non-Paper Estimates:</span>
                    <span className="text-[11.5px]">Estimate items without GST/Paper purchase records are automatically skipped.</span>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  {conversionTaxMode === 'EXCLUSIVE'
                    ? 'Tax Exclusive: GST is calculated and added on top of the base prices. The total invoice amount will increase by the GST amount.'
                    : 'Tax Inclusive: Grand total stays fixed, and GST is back-calculated from the price.'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/30 border border-border/80 rounded-2xl space-y-2">
              <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                <span>GST Pricing Calculation Mode</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {conversionTaxMode === 'EXCLUSIVE' ? 'Base price + GST added on top' : 'Grand total fixed, GST included'}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConversionTaxMode('EXCLUSIVE')}
                  className={clsx(
                    'p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col active:scale-[0.98]',
                    conversionTaxMode === 'EXCLUSIVE'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs shadow-amber-500/10 ring-1 ring-amber-500/30'
                      : 'bg-background border-border/80 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Tax Exclusive (+ GST)</span>
                    <span className={clsx("w-2 h-2 rounded-full", conversionTaxMode === 'EXCLUSIVE' ? "bg-amber-500 ring-2 ring-amber-500/30" : "bg-muted-foreground/30")} />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground mt-1">Calculated base price + GST added on top</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConversionTaxMode('INCLUSIVE')}
                  className={clsx(
                    'p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col active:scale-[0.98]',
                    conversionTaxMode === 'INCLUSIVE'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs shadow-amber-500/10 ring-1 ring-amber-500/30'
                      : 'bg-background border-border/80 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Tax Inclusive (MRP)</span>
                    <span className={clsx("w-2 h-2 rounded-full", conversionTaxMode === 'INCLUSIVE' ? "bg-amber-500 ring-2 ring-amber-500/30" : "bg-muted-foreground/30")} />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground mt-1">Total price already includes GST inside</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <span>Bill / Invoice</span>
                <span>BoS Amount ➔ Converted GST</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-0.5">
                {selectedBosInvoices.map(inv => {
                  const invPreview = conversionPreview?.invoices?.find(p => p.invoice_id === inv.invoice_id);
                  return (
                    <div key={inv.invoice_id} className="flex items-center justify-between p-2.5 bg-card border border-border rounded-xl text-xs">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground">{inv.invoice_number}</span>
                        {invPreview?.skipped_items && invPreview.skipped_items.length > 0 && (
                          <span className="text-[10px] text-amber-500 font-medium">
                            {invPreview.skipped_items.length} item{invPreview.skipped_items.length > 1 ? 's' : ''} skipped
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">{formatCurrency(inv.grand_total)}</span>
                          <span className="text-muted-foreground font-bold text-[10px]">➔</span>
                          <span className={clsx(
                            "font-black text-sm",
                            conversionPreviewLoading ? "opacity-50" : "",
                            conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                          )}>
                            {invPreview ? formatCurrency(invPreview.converted_grand_total) : formatCurrency(inv.grand_total)}
                          </span>
                        </div>
                        {invPreview && invPreview.tax_amount !== undefined && (
                          <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span>Base: {formatCurrency(invPreview.taxable_amount ?? (invPreview.converted_grand_total - invPreview.tax_amount))}</span>
                            <span>•</span>
                            <span className={clsx(
                              "font-bold",
                              conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                            )}>
                              GST: {conversionTaxMode === 'EXCLUSIVE' ? '+' : ''}{formatCurrency(invPreview.tax_amount)}
                            </span>
                            {Number(invPreview.deductions_total) > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-rose-500 font-bold">
                                  −{formatCurrency(invPreview.deductions_total)}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total Summary Breakdown Footer */}
            <div className="p-3.5 bg-muted/40 border border-border rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Original BoS Total</span>
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(conversionPreview?.total_bos_amount ?? selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0))}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Taxable Amount (Base)</span>
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(conversionPreview?.total_taxable_amount ?? (conversionPreview?.total_converted_amount ? Math.max(0, conversionPreview.total_converted_amount - (conversionPreview.total_tax_amount || 0)) : selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0)))}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={clsx("font-bold flex items-center gap-1", conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500")}>
                  <span>GST Tax Amount</span>
                  <span className="text-[10px] font-normal opacity-80">
                    ({conversionTaxMode === 'EXCLUSIVE' ? '+ Added on Base' : 'Included in Total'})
                  </span>
                </span>
                <span className={clsx("font-mono font-black text-sm", conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500")}>
                  {conversionTaxMode === 'EXCLUSIVE' ? '+' : ''}{formatCurrency(conversionPreview?.total_tax_amount ?? 0)}
                </span>
              </div>

              {conversionDeductionsTotal > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-rose-500">Less: Points / Scrap / Returns</span>
                  <span className="font-mono font-black text-rose-500">
                    −{formatCurrency(conversionDeductionsTotal)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/80">
                <div>
                  <span className="text-xs font-black text-foreground uppercase tracking-wider block">Estimated GST Total</span>
                  <span className="text-[10px] text-muted-foreground">
                    {conversionTaxMode === 'EXCLUSIVE' ? 'Base + GST Amount' : 'Fixed Total (MRP)'}
                    {conversionDeductionsTotal > 0 ? ' − deductions' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    "text-lg font-mono font-black",
                    conversionTaxMode === 'EXCLUSIVE' ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {formatCurrency(conversionPreview?.total_converted_amount ?? selectedBosInvoices.reduce((s, i) => s + (Number(i.grand_total) || 0), 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setConversionOpen(false)}
                disabled={converting}
                className="h-10 px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-150 active:scale-95 cursor-pointer border border-border/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConverting(true);
                  try {
                    const { tenantId, userId } = useAuthStore.getState();
                    if (isDesktopRuntime()) {
                      const result = await invoicesApi.convertBosToGst({
                        invoice_ids: selectedBosInvoices.map(i => i.invoice_id),
                        tenant_id: tenantId || 'global',
                        user_id: userId || '',
                        tax_mode: conversionTaxMode,
                      });
                      if (result.success && result.results) {
                        setConversionResults(result.results);
                        const ok = result.results.filter((r) => r.success).length;
                        const fail = result.results.length - ok;
                        if (fail === 0) {
                          showToast(`Successfully converted ${ok} Bill of Supply invoice${ok !== 1 ? 's' : ''} to GST`, 'success');
                        } else if (ok === 0) {
                          showToast(`Conversion failed for ${fail} invoice${fail !== 1 ? 's' : ''}`, 'error');
                        } else {
                          showToast(`${ok} converted, ${fail} failed`, 'error');
                        }
                      } else {
                        setConversionResults(selectedBosInvoices.map(i => ({
                          invoice_id: i.invoice_id,
                          old_number: i.invoice_number,
                          new_number: '',
                          success: false,
                          error: result.error || 'Conversion failed',
                        })));
                        showToast(result.error || 'Conversion failed', 'error');
                      }
                    }
                  } catch (err) {
                    setConversionResults(selectedBosInvoices.map(i => ({
                      invoice_id: i.invoice_id,
                      old_number: i.invoice_number,
                      new_number: '',
                      success: false,
                      error: (err as Error)?.message || 'Unknown error',
                    })));
                    showToast('Conversion failed: ' + ((err as Error)?.message || 'Unknown error'), 'error');
                  } finally {
                    setConverting(false);
                    loadInvoices(true);
                  }
                }}
                disabled={converting}
                className="h-10 px-6 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm shadow-amber-500/20 cursor-pointer flex items-center gap-2"
              >
                {converting ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span>Converting...</span></>
                ) : (
                  <><ArrowDownRight className="w-3.5 h-3.5" /> <span>Convert to GST</span></>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
