import { hasBridge } from '../../../data/client';
import { productsApi } from '../../../data/products';
import { resolveDateRange } from '../dates';
import { formatQty } from '../format';
import type { AiQueryContext } from '../queryContext';
import type { OfflineAiResponse, ParsedOfflineIntent } from '../types';

export async function nonSellingStockReply(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse> {
  if (!hasBridge('dbGetProductSalesSummary')) throw new Error('Product movement records are unavailable. Open Stock Report to review movement.');
  const range = resolveDateRange(parsed.params.rangeType || 'last_30_days', parsed.params.customFrom, parsed.params.customTo, ctx.isMal);
  const products = await ctx.fetchProducts();
  const summary = await productsApi.getProductSalesSummary({ tenant_id: ctx.tenantId, fromDate: range.fromDate, toDate: range.toDate });
  if (!Array.isArray(summary)) throw new Error('Product movement records could not be read.');
  if (!summary.length && (await ctx.fetchInvoices(range.fromDate, range.toDate)).length) {
    throw new Error('Sales exist for this period but product movement could not be confirmed. Open Stock Report to review it.');
  }
  const inStock = products.filter(p => Number(p.current_stock ?? p.stock_quantity) > 0);
  if (inStock.some(p => !p.product_id)) throw new Error('Some stock records could not be matched to product movement. Review Inventory before relying on this report.');
  const sold = new Set(summary.filter(p => Number(p.total_qty) > 0).map(p => p.product_id));
  const rows = inStock.filter(p => p.product_id && !sold.has(p.product_id));
  let content = ctx.isMal
    ? `### വിൽപ്പന രേഖയില്ലാത്ത നിലവിലെ സ്റ്റോക്ക്\n\n**വിൽപ്പന പരിശോധിച്ച കാലയളവ്:** ${range.fromDate} → ${range.toDate} (${range.label})\n**ഉൽപ്പന്നങ്ങൾ:** ${rows.length}\n\nഇപ്പോൾ stock ഉള്ള ഉൽപ്പന്നങ്ങളിൽ, ഈ കാലയളവിൽ വിറ്റ അളവ് രേഖകളിൽ കാണാത്തവയാണ്. ഇത് പഴയ തീയതിയിലെ stock snapshot അല്ല.\n\n`
    : `### Current stock with no recorded sales\n\n**Sales period:** ${range.fromDate} → ${range.toDate} (${range.label})\n**Products found:** ${rows.length}\n\nThese products are in stock now and have no positive sold quantity in the local product-sales records for this period. This is not a historical stock snapshot.\n\n`;
  content += '| Product | Barcode | Current Stock |\n| :--- | :--- | ---: |\n';
  for (const p of rows.slice(0, 25)) content += `| ${p.name || '—'} | ${p.sku_barcode || p.item_code || '—'} | ${formatQty(p.current_stock ?? p.stock_quantity)} |\n`;
  if (rows.length > 25) content += ctx.isMal ? '\nആദ്യ 25 ഉൽപ്പന്നങ്ങളാണ് കാണിക്കുന്നത്.' : '\nShowing the first 25 matching products.';
  return { content, intent: 'INVENTORY_NON_SELLING' };
}
