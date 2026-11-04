import clsx from 'clsx';
import type { EinvoiceStatusRow } from '../../../data/einvoice';
import { einvoiceErrorLines, einvoiceStatusLabel, needsPaperCopy, type StatusTone } from '../../../utils/einvoice/einvoice';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  pending: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

/** UAE e-invoice status of one invoice; the tooltip lists missing data / ASP errors and the paper-copy requirement. */
export function EinvoiceBadge({ row }: { row: EinvoiceStatusRow | undefined }) {
  const { label, tone } = einvoiceStatusLabel(row?.status);
  const details = [
    ...(row ? einvoiceErrorLines(row.errors).filter(line => !['B2C', 'NOT_A_SALE', 'DELETED'].includes(line)) : []),
    ...(row?.fta_reference ? [`FTA reference ${row.fta_reference}`] : []),
    ...(row && needsPaperCopy(row.buyer_endpoint) && row.status !== 'NOT_REQUIRED' ? ['Buyer is not on e-invoicing yet: also give a printed tax invoice'] : []),
  ];
  return (
    <span title={details.join('\n') || undefined}
      className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap', TONES[tone])}>
      {label}{details.length > 0 && row?.status !== 'REPORTED' ? ' ⓘ' : ''}
    </span>
  );
}
