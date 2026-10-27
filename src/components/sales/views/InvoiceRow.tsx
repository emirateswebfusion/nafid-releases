import type { DisplayInvoice } from '../invoiceDisplayTypes';
import type { UpiSourceOption } from '../salesTypes';
/** Sales History list row (`InvoiceRow`) and its payment / invoice-type badges. */
import { PAYMENT_COLORS, PAYMENT_LABELS, getInvoiceTypeInfo, formatDate, parseSplitDetails, getUpiDetailsFromInvoice } from '../salesHistoryFormat';
import clsx from 'clsx';
import { Receipt, FileText, Clock, User, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import { getSalesHistoryAmount } from '../../../utils/pricing/salesHistoryAmount';
import type { SalesInvoiceRow } from '../salesTypes';

/* ─── Payment Badge ─── */
export function PaymentBadge({ method }: { method: string }) {
  const c = PAYMENT_COLORS[method] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: '#888' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider', c.bg, c.text)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {PAYMENT_LABELS[method] || method}
    </span>
  );
}

/* ─── Invoice Type Badge ─── */
export function InvoiceTypeBadge({ inv }: { inv: DisplayInvoice }) {
  const info = getInvoiceTypeInfo(inv);
  const Icon = info.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border', info.bg, info.text, info.border)}>
      <Icon className="w-3 h-3" />
      {info.label}
    </span>
  );
}

/* ─── Invoice Row ─── */
export function InvoiceRow({ inv, isSelected, onClick, onMouseEnter, selectionMode, isChecked, onCheck, convertible, upiSources = [], onDownload: _onDownload, onPrint: _onPrint }: { inv: DisplayInvoice; isSelected: boolean; onClick: () => void; onMouseEnter?: () => void; selectionMode?: boolean; isChecked?: boolean; onCheck?: () => void; convertible?: boolean; upiSources?: UpiSourceOption[]; onDownload?: (inv: SalesInvoiceRow) => void; onPrint?: (inv: SalesInvoiceRow) => void }) {
  const { date, time } = formatDate(inv.created_at || '');
  const isCredit = inv.payment_method === 'CREDIT';
  const isConvertedBos = !!inv.converted_to_invoice_id;
  const isConversionCopy = !!inv.converted_from_invoice_id;
  const canConvert = inv.invoice_type === 'BILL_OF_SUPPLY' && !isConvertedBos && !!convertible;

  return (
    <tr
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={clsx(
        'group cursor-pointer transition-all duration-150 border-b border-border last:border-0',
        isSelected
          ? 'bg-primary/5'
          : isChecked
            ? 'bg-amber-500/10'
            : 'hover:bg-muted/30'
      )}
    >
      {/* Invoice # */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          {selectionMode ? (
            canConvert ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onCheck?.();
                }}
                className="flex items-center justify-center cursor-pointer shrink-0 p-0.5"
                title={isChecked ? 'Deselect bill' : 'Select bill'}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  className={clsx(
                    'w-4 h-4 rounded-md border-2 transition-all cursor-pointer',
                    isChecked
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-border/80 hover:border-amber-500'
                  )}
                />
              </div>
            ) : (inv.invoice_type === 'BILL_OF_SUPPLY' && !isConvertedBos) ? (
              <div className="flex items-center justify-center shrink-0 p-0.5" title="Full Estimate Bill (cannot convert to GST)">
                <input
                  type="checkbox"
                  disabled
                  checked={false}
                  className="w-4 h-4 rounded-md border border-border/40 bg-muted/40 opacity-30 cursor-not-allowed"
                />
              </div>
            ) : null
          ) : null}
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 flex-wrap">
              <span>{inv.invoice_number}</span>
              {isConvertedBos && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20" title={`Converted to GST: ${inv.converted_to_invoice_number || ''}`}>
                  ⚡ GST Filed {inv.converted_to_invoice_number ? `(${inv.converted_to_invoice_number})` : ''}
                </span>
              )}
              {isConversionCopy && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title={`Statutory GST filing copy from BOS: ${inv.converted_from_invoice_number || ''}`}>
                  📄 Tax Copy {inv.converted_from_invoice_number ? `(From ${inv.converted_from_invoice_number})` : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 flex-wrap">
              <span>{inv.item_count || 0} item{(inv.item_count || 0) !== 1 ? 's' : ''}</span>
              {(inv.description || inv.notes) && (
                <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md max-w-[140px] truncate" title={(inv.description || inv.notes)!}>
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{inv.description || inv.notes}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <InvoiceTypeBadge inv={inv} />
      </td>
      {/* Date & Time */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="text-xs font-semibold text-foreground/80">{date}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="w-2.5 h-2.5" />{time}
        </div>
      </td>
      {/* Customer */}
      <td className="px-4 py-3.5">
        <div className="text-xs font-semibold text-foreground/80 truncate max-w-[120px]">{inv.customer_name || 'Walk-in'}</div>
        {inv.biller_name && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="w-2.5 h-2.5" />{inv.biller_name}
          </div>
        )}
      </td>
      {/* Payment */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col items-start gap-0.5">
          <PaymentBadge method={inv.payment_method || 'PENDING'} />
          {(inv.payment_method === 'SPLIT' || (inv.payment_method === 'CREDIT' && inv.split_details)) && (() => {
            const sd = parseSplitDetails(inv.split_details);
            if (!sd) return null;
            const parts: string[] = [];
            if (Number(sd.cash) > 0) parts.push(`Cash: ₹${Number(sd.cash).toFixed(2)}`);
            if (Number(sd.upi) > 0) parts.push(`UPI: ₹${Number(sd.upi).toFixed(2)}`);
            if (Number(sd.card) > 0) parts.push(`Card: ₹${Number(sd.card).toFixed(2)}`);
            if (Number(sd.bank_transfer) > 0) parts.push(`Bank: ₹${Number(sd.bank_transfer).toFixed(2)}`);
            if (Number(sd.credit) > 0) parts.push(`Credit: ₹${Number(sd.credit).toFixed(2)}`);
            if (parts.length === 0) return null;
            return (
              <div className="text-[10px] font-black text-purple-700 dark:text-purple-300 mt-0.5 leading-snug">
                {parts.join(' • ')}
              </div>
            );
          })()}
          {(() => {
            const upiDetail = getUpiDetailsFromInvoice(inv, upiSources);
            if ((inv.payment_method === 'UPI' || (inv.payment_method === 'SPLIT' && (Number(parseSplitDetails(inv.split_details)?.upi) || 0) > 0)) && upiDetail) {
              return (
                <div className="text-[10px] leading-snug mt-0.5">
                  <div className="font-extrabold text-violet-700 dark:text-violet-300">{upiDetail.name}</div>
                  {upiDetail.upiId && (
                    <div className="text-[9.5px] font-bold text-violet-600/90 dark:text-violet-400/90 font-mono">
                      {upiDetail.upiId}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}
        </div>
        {isCredit && inv.balance_amount! < 0 && (
          <div className="text-[10px] text-amber-500 font-semibold mt-0.5">
            Due: {formatCurrency(Math.abs(inv.balance_amount!))}
          </div>
        )}
      </td>
      {/* Amount */}
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        {(() => {
          const summary = getSalesHistoryAmount(inv);

          if (summary.refund) {
            return (
              <>
                <div className="text-sm font-black text-rose-600 dark:text-rose-400">
                  -{formatCurrency(summary.amount)}
                </div>
                <div className="text-[10px] text-rose-500 font-semibold mt-0.5">
                  Refund
                </div>
                {Math.abs(summary.refundDifference) > 0.005 && (
                  <div
                    className={clsx('text-[10px] font-semibold mt-0.5', summary.refundDifference > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400')}
                    title={summary.refundDifference > 0 ? 'Amount paid above the calculated refund' : 'Amount paid below the calculated refund'}
                  >
                    {summary.refundDifference > 0 ? '+' : '-'}{formatCurrency(Math.abs(summary.refundDifference))}
                  </div>
                )}
              </>
            );
          }

          return (
            <>
              <div className={clsx('text-sm font-black', isSelected ? 'text-primary' : 'text-foreground')}>
                {formatCurrency(summary.amount)}
              </div>
              {summary.discount > 0 && (
                <div className="text-[10px] text-red-500 font-semibold mt-0.5">
                  -{formatCurrency(summary.discount)} off
                </div>
              )}
            </>
          );
        })()}
      </td>
      {/* Arrow */}
      <td className="px-3 py-3.5 text-right">
        <ChevronRight className={clsx(
          'w-4 h-4 transition-all duration-200',
          isSelected ? 'text-primary translate-x-0.5' : 'text-border group-hover:text-muted-foreground group-hover:translate-x-0.5'
        )} />
      </td>
    </tr>
  );
}
