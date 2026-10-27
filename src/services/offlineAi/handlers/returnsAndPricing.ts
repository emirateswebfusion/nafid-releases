import { settingsApi } from '../../../data/settings';
import { hasBridge } from '../../../data/client';
import { returnsApi } from '../../../data/returns';
import { resolveDateRange } from '../dates';
import { formatINR } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Returns, discounts, loyalty points, price and barcode lookups. */
export async function handleReturnsAndPricingIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { isMal, fetchInvoices, fetchProducts, fetchReturns } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 16. Returns, Discounts & Loyalty (4.7)
    // ──────────────────────────────────────────────────────────────────────
    case 'RETURNS_SUMMARY': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const rets = await fetchReturns();
      const filtered = rets.filter((r: AiRow) => {
        const d = (r.created_at || '').slice(0, 10);
        return !d || (d >= range.fromDate && d <= range.toDate);
      });
      const total = filtered.reduce((a: number, r: AiRow) => a + (Number(r.grand_total) || 0), 0);

      const md = isMal
        ? `### 🔄 സെയിൽസ് റിട്ടേൺസ് സംഗ്രഹം — ${range.label}\n\n` +
          `* **ആകെ റിട്ടേൺ ബില്ലുകൾ:** **${filtered.length} എണ്ണം**\n` +
          `* **തിരിച്ചുനൽകിയ ആകെ തുക:** **${formatINR(total)}**\n`
        : `### 🔄 Sales Returns & Refunds Summary — ${range.label}\n\n` +
          `* **Total Returns Count:** **${filtered.length} records**\n` +
          `* **Total Refunded Amount:** **${formatINR(total)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'RETURNS_ITEMS': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const rets = await fetchReturns();
      const filtered = rets.filter((r: AiRow) => {
        const d = (r.created_at || '').slice(0, 10);
        return !d || (d >= range.fromDate && d <= range.toDate);
      });

      const itemMap: Record<string, { name: string; quantity: number; total: number }> = {};
      if (hasBridge('dbGetReturnItems')) {
        for (const ret of filtered.slice(0, 50)) {
          try {
            const items = await returnsApi.getReturnItems(ret.return_id as string);
            if (Array.isArray(items)) {
              items.forEach((it: AiRow) => {
                const name = it.product_name || it.name || 'Unnamed Product';
                if (!itemMap[name]) itemMap[name] = { name, quantity: 0, total: 0 };
                itemMap[name].quantity += Number(it.quantity) || 0;
                itemMap[name].total += Number(it.total || it.amount || 0);
              });
            }
          } catch { /* ignore */ }
        }
      }

      const sortedItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);

      let md = isMal
        ? `### 📦 തിരിച്ചുകൊടുത്ത ഉൽപ്പന്നങ്ങൾ — ${range.label}\n\n`
        : `### 📦 Returned Products & Quantities — ${range.label}\n\n`;

      if (sortedItems.length > 0) {
        md += isMal
          ? `| ഉൽപ്പന്നം | തിരിച്ചെടുത്ത അളവ് | ആകെ റീഫണ്ട് |\n| :--- | :---: | :---: |\n`
          : `| Product | Quantity Returned | Total Refund Value |\n| :--- | :---: | :---: |\n`;
        sortedItems.forEach(it => {
          md += `| **${it.name}** | ${it.quantity} | **${formatINR(it.total)}** |\n`;
        });
      } else {
        md += isMal
          ? `* പരിശോധിച്ച കാലയളവിൽ റിട്ടേൺ രേഖപ്പെടുത്തിയ ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തിയില്ല.\n`
          : `* No item-level return details found for the selected period.\n`;
      }

      return { content: md, intent: parsed.intent };
    }

    case 'RETURNS_BY_METHOD': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const rets = await fetchReturns();
      const filtered = rets.filter((r: AiRow) => {
        const d = (r.created_at || '').slice(0, 10);
        return !d || (d >= range.fromDate && d <= range.toDate);
      });
      const byMethod: Record<string, number> = {};
      filtered.forEach((r: AiRow) => {
        const m = r.refund_method || 'CASH';
        byMethod[m] = (byMethod[m] || 0) + (Number(r.grand_total) || 0);
      });

      let md = isMal
        ? `### 💳 റീഫണ്ട് പേയ്‌മെന്റ് രീതികൾ — ${range.label}\n\n| രീതി | തുക |\n| :--- | :---: |\n`
        : `### 💳 Refunds by Payment Method — ${range.label}\n\n| Refund Method | Total Refunded |\n| :--- | :---: |\n`;

      Object.keys(byMethod).forEach(k => {
        md += `| **${k}** | **${formatINR(byMethod[k])}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'DISCOUNTS_SUMMARY': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const minAmt = parsed.params.minAmount || 500;
      const highDiscInvs = invs.filter((i: AiRow) => Number(i.discount_total) >= minAmt);

      const md = isMal
        ? `### 🏷️ ഡിസ്കൗണ്ട് റിപ്പോർട്ട് — ${range.label}\n\n` +
          `* **₹${minAmt}-ൽ കൂടുതൽ ഡിസ്കൗണ്ട് നൽകിയ ബില്ലുകൾ:** **${highDiscInvs.length} ബില്ലുകൾ**\n`
        : `### 🏷️ Invoice Discounts Report — ${range.label}\n\n` +
          `* **Invoices with Discounts >= ₹${minAmt}:** **${highDiscInvs.length} bills**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'LOYALTY_POINTS': {
      if (hasBridge('settingsGet')) {
        const [config, flags] = await Promise.all([
          settingsApi.get({ tenant_id: ctx.tenantId, key: 'loyalty_config' }),
          settingsApi.get({ tenant_id: ctx.tenantId, key: 'feature_flags' }),
        ]);
        if (config?.enabled === false || flags?.loyalty === false) return { content: 'Loyalty points are disabled in Settings.', intent: parsed.intent };
      }
      const md = isMal
        ? `### 🎁 കസ്റ്റമർ ലോയൽറ്റി പോയിന്റുകൾ\n\n* ലോയൽറ്റി റിവാർഡ് പോയിന്റുകൾ കസ്റ്റമർ അക്കൗണ്ടുമായി ബന്ധിപ്പിച്ചിരിക്കുന്നു.\n`
        : `### 🎁 Customer Loyalty Points\n\n* Active loyalty program tracking points earned and redeemed.\n`;
      return { content: md, intent: parsed.intent };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 17. Product Pricing & Barcode (4.8)
    // ──────────────────────────────────────────────────────────────────────
    case 'PRODUCT_PRICE_LOOKUP': {
      const prods = await fetchProducts();
      const term = (parsed.params.productName || '').toLowerCase().trim();
      const matched = prods.filter((p: AiRow) => p.name?.toLowerCase().includes(term));

      if (matched.length === 0) {
        return { content: isMal ? `"${term}" എന്ന ഉൽപ്പന്നം കണ്ടെത്താനായില്ല.` : `Could not find product matching "${term}".` };
      }

      const p = matched[0];
      const md = isMal
        ? `### 🏷️ വില വിവരങ്ങൾ: **${p.name}**\n\n` +
          `* **റീട്ടെയിൽ വില (MRP / Base Price):** **${formatINR(p.base_price)}**\n` +
          `* **പർച്ചേസ് വില:** ${formatINR(p.purchase_price)}\n` +
          `* **ഓഫർ വില:** ${formatINR(p.offer_price || p.base_price)}\n` +
          `* **ടാക്സ് റേറ്റ് (GST):** ${p.tax_rate_percent || 0}%\n` +
          (parsed.params.includeBarcode ? `* **ബാർകോഡ്:** ${p.sku_barcode || 'ലഭ്യമല്ല'}\n` : '')
        : `### 🏷️ Pricing Details: **${p.name}**\n\n` +
          `* **Retail Selling Price (Base Price):** **${formatINR(p.base_price)}**\n` +
          `* **Purchase Price (Cost):** ${formatINR(p.purchase_price)}\n` +
          `* **Offer / Wholesale Price:** ${formatINR(p.offer_price || p.base_price)}\n` +
          `* **GST Tax Rate:** ${p.tax_rate_percent || 0}%\n` +
          (parsed.params.includeBarcode ? `* **Barcode / SKU:** ${p.sku_barcode || 'None'}\n` : '');

      return { content: md, intent: parsed.intent };
    }

    case 'PRODUCT_BARCODE_LOOKUP': {
      const prods = await fetchProducts();
      const code = (parsed.params.code || '').trim();
      const matched = prods.filter((p: AiRow) => p.sku_barcode === code || p.item_code === code);

      if (matched.length === 0) {
        return { content: isMal ? `"${code}" എന്ന ബാർകോഡിൽ ഉൽപ്പന്നങ്ങൾ ഒന്നുമില്ല.` : `No product found with barcode "${code}".` };
      }

      const p = matched[0];
      const md = isMal
        ? `### 🔍 ബാർകോഡ് ഉൽപ്പന്നം: **${p.name}**\n\n` +
          `* **ബാർകോഡ്:** ${p.sku_barcode || '—'}\n` +
          `* **വില:** **${formatINR(p.base_price)}**\n` +
          `* **സ്റ്റോക്ക്:** ${p.current_stock || 0} ${p.uom || 'units'}\n`
        : `### 🔍 Barcode Lookup Result: **${p.name}**\n\n` +
          `* **Barcode / SKU:** ${p.sku_barcode || '—'}\n` +
          `* **Unit Price:** **${formatINR(p.base_price)}**\n` +
          `* **Current Stock:** ${p.current_stock || 0} ${p.uom || 'units'}\n`;

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
