import type { AiQueryContext } from '../queryContext';
import type { OfflineAiResponse } from '../types';
import { formatMoney } from '../format';

/** Purchase payment_type describes the saved bill; current payable belongs to the supplier ledger. */
export async function purchaseCreditReply({ fetchPurchaseBills, isMal }: AiQueryContext): Promise<OfflineAiResponse> {
  const bills = (await fetchPurchaseBills()).filter(b => {
    const kind = String(b.payment_type || '').toUpperCase();
    return kind === 'CREDIT' || kind.includes('PENDING');
  });
  const total = bills.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  let content = isMal
    ? `### ക്രെഡിറ്റ് / പെൻഡിംഗ് പർച്ചേസ് ബില്ലുകൾ\n\n**രേഖപ്പെടുത്തിയ ബില്ലുകൾ:** ${bills.length}\n**ബില്ലുകളുടെ ആകെ തുക:** ${formatMoney(total)}\n\nഇത് ബില്ലിൽ രേഖപ്പെടുത്തിയ payment type-ഉം ബിൽ തുകയുമാണ്. പിന്നീട് supplier-ന് നൽകിയ പേയ്‌മെന്റുകൾക്കുശേഷമുള്ള ഇപ്പോഴത്തെ ബാക്കി Supplier Ledger-ൽ പരിശോധിക്കുക.\n\n`
    : `### Credit / Pending Purchase Bills\n\n**Recorded bills:** ${bills.length}\n**Total bill value:** ${formatMoney(total)}\n\nThese are the saved bill payment types and original bill values. Check the Supplier Ledger for the current payable after subsequent supplier payments; these values are not a confirmed remaining balance.\n\n`;
  content += '| Bill | Supplier | Payment Type | Bill Value |\n| :--- | :--- | :--- | ---: |\n';
  for (const b of bills.slice(0, 25)) content += `| ${b.bill_number || '—'} | ${b.supplier_name || '—'} | ${b.payment_type || '—'} | ${formatMoney(b.total_amount)} |\n`;
  if (bills.length > 25) content += isMal ? '\nആദ്യ 25 ബില്ലുകൾ കാണിക്കുന്നു; ബാക്കി Purchase Bills-ൽ പരിശോധിക്കാം.' : '\nShowing the first 25 bills; review the rest in Purchase Bills.';
  return { content, intent: 'PURCHASES_UNPAID', suggestedPrompts: ['How much do we owe to suppliers?'] };
}
