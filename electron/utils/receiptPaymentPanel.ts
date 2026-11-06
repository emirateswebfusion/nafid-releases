import { UPI_QR_SIZE } from './upiQr.js';

export interface ReceiptPointRow { label: string; value: string }
const POINT_LABELS = ['Bill Points', 'Used Point', 'Used Amt', 'Balance Points'];

/** Only consume the complete boxed loyalty table immediately following a QR marker.
 * Plain receipt text stays intact for network printers and historical receipts. */
export function readReceiptPointRows(lines: string[], qrIndex: number): ReceiptPointRow[] {
  const rows: ReceiptPointRow[] = [];
  for (const [offset, label] of POINT_LABELS.entries()) {
    const cells = (lines[qrIndex + offset + 1] || '').trim().split('│').filter(Boolean);
    if (cells.length !== 2 || cells[0].trim() !== label) return [];
    rows.push({ label, value: cells[1].trim() });
  }
  return rows;
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Shared by Chromium printing and both React previews. All variable text is escaped. */
export function receiptPaymentPanelHtml(imageUrl: string | null, rows: ReceiptPointRow[]): string {
  const qr = imageUrl
    ? `<img alt="UPI QR Code" src="${escape(imageUrl)}" style="width:${UPI_QR_SIZE};max-width:100%;height:auto;display:block;image-rendering:pixelated;" />`
    : '<span>UPI QR unavailable</span>';
  const details = rows.length
    ? rows.map((row, index) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px;min-height:6.25mm;padding:1px 3px;box-sizing:border-box;border-bottom:${index === rows.length - 1 ? '0' : '1px solid #000'};"><span style="overflow-wrap:anywhere;">${escape(row.label)}</span><span style="text-align:right;overflow-wrap:anywhere;">${escape(row.value)}</span></div>`).join('')
    : '<div style="padding:4px;text-align:center;">Scan &amp; Pay<br />via UPI</div>';
  return `<div data-receipt-payment-panel style="display:grid;grid-template-columns:${UPI_QR_SIZE} minmax(0,1fr);align-items:stretch;width:100%;box-sizing:border-box;break-inside:avoid;${rows.length ? '' : 'border-top:1px solid #000;border-bottom:1px solid #000;'}color:#000;background:#fff;font:700 9px Arial,sans-serif;"><div style="display:flex;align-items:center;justify-content:center;">${qr}</div><div style="min-width:0;display:flex;flex-direction:column;justify-content:center;border-left:1px solid #000;">${details}</div></div>`;
}
