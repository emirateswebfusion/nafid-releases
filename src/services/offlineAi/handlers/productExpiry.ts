import { getStoreBusinessDate } from '../../../utils/time/timezoneHelper';
import { parseUTCDate } from '../../../utils/time/utc';
import { formatQty } from '../format';
import type { AiRow, OfflineAiResponse } from '../types';

function expiryDate(product: AiRow): string | undefined {
  let attributes: unknown = product.domain_attributes;
  if (typeof attributes === 'string') {
    try { attributes = JSON.parse(attributes); } catch { attributes = undefined; }
  }
  const stored = attributes && typeof attributes === 'object' && 'expiry_date' in attributes ? attributes.expiry_date : undefined;
  const value = typeof stored === 'string' ? stored : product.expiry_date;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = parseUTCDate(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

/** Expiry is a date-only label. Comparing UTC containers for two calendar labels does not offset either date. */
export function classifyProductExpiry(products: AiRow[], today: string) {
  const dated = products.flatMap(product => {
    const expiry = expiryDate(product);
    const stock = Number(product.current_stock ?? product.stock_quantity) || 0;
    return expiry && stock > 0 ? [{ product, expiry, stock, days: (parseUTCDate(expiry).getTime() - parseUTCDate(today).getTime()) / 86_400_000 }] : [];
  });
  return { expired: dated.filter(p => p.days < 0), near: dated.filter(p => p.days >= 0 && p.days <= 30) };
}

export function productExpiryReply(products: AiRow[], isMal: boolean): OfflineAiResponse {
  const today = getStoreBusinessDate();
  const { expired, near } = classifyProductExpiry(products, today);
  let content = isMal
    ? `### കാലാവധി പരിശോധന\n\n**കടയുടെ തീയതി:** ${today}\n**കാലാവധി കഴിഞ്ഞവ:** ${expired.length}\n**അടുത്ത 30 ദിവസത്തിനുള്ളിൽ:** ${near.length}\n\nExpiry തീയതി രേഖപ്പെടുത്തിയതും ഇപ്പോൾ stock ഉള്ളതുമായ ഉൽപ്പന്നങ്ങളാണ് പരിശോധിക്കുന്നത്.\n\n`
    : `### Product Expiry Alert\n\n**Shop date:** ${today}\n**Expired products:** ${expired.length}\n**Expiring within 30 days:** ${near.length}\n\nOnly products with a recorded expiry date and positive current stock are evaluated.\n\n`;
  for (const [title, rows] of [[isMal ? 'കാലാവധി കഴിഞ്ഞവ' : 'Expired items', expired], [isMal ? 'അടുത്ത 30 ദിവസത്തിനുള്ളിൽ' : 'Within 30 days (including today)', near]] as const) {
    if (!rows.length) continue;
    content += `#### ${title}\n\n| Product | Current Stock | Expiry Date |\n| :--- | ---: | :--- |\n`;
    for (const row of rows.slice(0, 25)) content += `| ${row.product.name || '—'} | ${formatQty(row.stock)} | ${row.expiry} |\n`;
    if (rows.length > 25) content += isMal ? '\nആദ്യ 25 രേഖകളാണ് കാണിക്കുന്നത്.\n' : '\nShowing the first 25 records.\n';
    content += '\n';
  }
  return { content, intent: 'INVENTORY_EXPIRY_ALERT' };
}
