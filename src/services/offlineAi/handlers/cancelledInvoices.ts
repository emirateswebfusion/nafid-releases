import { recycleBinApi } from '../../../data/recycleBin';
import { hasBridge } from '../../../data/client';
import { formatMoney } from '../format';
import type { AiQueryContext } from '../queryContext';
import type { OfflineAiResponse } from '../types';

/** Deleted POS invoices are a distinct source from card voids and restaurant cancellations. */
export async function cancelledInvoicesReply({ tenantId, isMal }: AiQueryContext): Promise<OfflineAiResponse> {
  if (!hasBridge('dbGetDeletedInvoices')) return {
    intent: 'SALES_CANCELLED_INVOICES', content: isMal
      ? 'ഈ പതിപ്പിൽ deleted invoice രേഖകൾ ഇവിടെ വായിക്കാൻ ലഭ്യമല്ല. Recycle Bin → Invoices പരിശോധിക്കുക; എണ്ണം പൂജ്യമാണെന്ന് സ്ഥിരീകരിക്കാനാവില്ല.'
      : 'Deleted invoice records are unavailable in this version. Check Recycle Bin → Invoices; I cannot confirm a zero count.',
  };
  const rows = await recycleBinApi.getDeletedInvoices(tenantId);
  if (!Array.isArray(rows)) throw new Error('Deleted invoice records could not be read.');
  let content = isMal
    ? `### Recycle Bin-ലെ നീക്കിയ ഇൻവോയ്സുകൾ\n\n**രേഖകളുടെ എണ്ണം:** ${rows.length}\n\nഇത് ഇപ്പോൾ Recycle Bin-ൽ ലഭ്യമായ എല്ലാ deleted POS invoice രേഖകളുമാണ്; ഇന്നത്തേത് മാത്രമല്ല. Card-terminal void, restaurant order cancellation എന്നിവ ഇതിൽ ഉൾപ്പെടുന്നില്ല.\n\n`
    : `### Deleted POS invoices in Recycle Bin\n\n**Records found:** ${rows.length}\n\nThese are all currently available soft-deleted POS invoices, not only today's records. Card-terminal voids and restaurant order cancellations are separate.\n\n`;
  content += '| Invoice | Customer | Amount |\n| :--- | :--- | ---: |\n';
  for (const row of rows.slice(0, 25)) content += `| ${row.invoice_number || '—'} | ${row.customer_name || 'Walk-in'} | ${formatMoney(row.grand_total)} |\n`;
  if (rows.length > 25) content += isMal ? '\nആദ്യ 25 രേഖകളാണ് കാണിക്കുന്നത്; ബാക്കി Recycle Bin-ൽ പരിശോധിക്കാം.' : '\nShowing the first 25 records; review the remainder in Recycle Bin.';
  return { content, intent: 'SALES_CANCELLED_INVOICES' };
}
