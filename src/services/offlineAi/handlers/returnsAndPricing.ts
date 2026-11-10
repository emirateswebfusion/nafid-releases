import { clarifyProduct } from '../productSelection';
import { customersApi } from '../../../data/customers';
import { catalogSellingRate } from '../catalogPrice';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { settingsApi } from '../../../data/settings';
import { hasBridge } from '../../../data/client';
import { returnsApi } from '../../../data/returns';
import { resolveDateRange } from '../dates';
import { formatMoney } from '../format';
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
          `* **തിരിച്ചുനൽകിയ ആകെ തുക:** **${formatMoney(total)}**\n`
        : `### 🔄 Sales Returns & Refunds Summary — ${range.label}\n\n` +
          `* **Total Returns Count:** **${filtered.length} records**\n` +
          `* **Total Refunded Amount:** **${formatMoney(total)}**\n`;

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
          md += `| **${it.name}** | ${it.quantity} | **${formatMoney(it.total)}** |\n`;
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
        md += `| **${k}** | **${formatMoney(byMethod[k])}** |\n`;
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
          `* **${getCurrencyPrefix()}${minAmt}-ൽ കൂടുതൽ ഡിസ്കൗണ്ട് നൽകിയ ബില്ലുകൾ:** **${highDiscInvs.length} ബില്ലുകൾ**\n`
        : `### 🏷️ Invoice Discounts Report — ${range.label}\n\n` +
          `* **Invoices with Discounts >= ${getCurrencyPrefix()}${minAmt}:** **${highDiscInvs.length} bills**\n`;

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
      if (!hasBridge('dbGetCustomers')) throw new Error('Customer points records are unavailable');
      const name = (parsed.params.customerName || '').trim();
      if (!name) return { content: isMal ? 'ഏത് കസ്റ്റമറുടെ പോയിന്റുകളാണ് വേണ്ടത്? പേര് പറയൂ.' : 'Whose points do you need? Please give the customer name.', clarificationRequired: true };
      const customers = await customersApi.getCustomers({ tenant_id: ctx.tenantId });
      if (!Array.isArray(customers)) throw new Error('Customer points records are unavailable');
      const matches = customers.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
      if (matches.length !== 1) return { content: matches.length ? `${isMal ? 'ഏത് കസ്റ്റമർ?' : 'Which customer?'} ${matches.map(c => c.name).join(', ')}` : `${isMal ? 'കസ്റ്റമറെ കണ്ടെത്തിയില്ല:' : 'Customer not found:'} ${name}`, clarificationRequired: true };
      const customer = matches[0];
      if (customer.current_points_balance == null) throw new Error('Customer points balance is unavailable');
      return { content: `### ${customer.name}\n\n${isMal ? 'ലോയൽറ്റി പോയിന്റുകൾ' : 'Loyalty points'}: **${customer.current_points_balance}**`, intent: parsed.intent };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 17. Product Pricing & Barcode (4.8)
    // ──────────────────────────────────────────────────────────────────────
    case 'PRODUCT_PRICE_LOOKUP': {
      const prods = await fetchProducts();
      const term = (parsed.params.productName || '').toLowerCase().trim();
      const matched = prods.filter((p: AiRow) => p.name?.toLowerCase().includes(term) || p.sku_barcode === term);

      if (matched.length === 0) {
        return { content: isMal ? `"${term}" എന്ന ഉൽപ്പന്നം കണ്ടെത്താനായില്ല.` : `Could not find product matching "${term}".` };
      }

      const clarification = clarifyProduct(matched, 'price', isMal);
      if (clarification) return clarification;
      const p = matched[0];
      const md = isMal
        ? `### 🏷️ വില വിവരങ്ങൾ: **${p.name}**\n\n` +
          `* **റീട്ടെയിൽ വില (Base Price):** **${formatMoney(p.base_price)}**\n` +
          `* **പർച്ചേസ് വില:** ${formatMoney(p.purchase_price)}\n` +
          `* **ഓഫർ / ഡിസ്കൗണ്ടിനു ശേഷമുള്ള വില:** ${formatMoney(catalogSellingRate(p))}\n` +
          `* **ടാക്സ് റേറ്റ് (GST):** ${p.tax_rate_percent || 0}%\n` +
          (parsed.params.includeBarcode ? `* **ബാർകോഡ്:** ${p.sku_barcode || 'ലഭ്യമല്ല'}\n` : '')
        : `### 🏷️ Pricing Details: **${p.name}**\n\n` +
          `* **Retail Selling Price (Base Price):** **${formatMoney(p.base_price)}**\n` +
          `* **Purchase Price (Cost):** ${formatMoney(p.purchase_price)}\n` +
          `* **Catalog Price After Offers / Discounts:** ${formatMoney(catalogSellingRate(p))}\n` +
          `* **GST Tax Rate:** ${p.tax_rate_percent || 0}%\n` +
          (parsed.params.includeBarcode ? `* **Barcode / SKU:** ${p.sku_barcode || 'None'}\n` : '');

      return { content: md, intent: parsed.intent };
    }

    case 'PRODUCT_BARCODE_LOOKUP': {
      const prods = await fetchProducts();
      const code = (parsed.params.code || parsed.params.productName || '').trim();
      const matched = prods.filter((p: AiRow) => p.sku_barcode === code || p.item_code?.toLowerCase() === code.toLowerCase() || (Boolean(parsed.params.productName) && p.name?.toLowerCase().includes(code.toLowerCase())));

      if (matched.length === 0) {
        return { content: isMal ? `"${code}" എന്ന ബാർകോഡിൽ ഉൽപ്പന്നങ്ങൾ ഒന്നുമില്ല.` : `No product found with barcode "${code}".` };
      }

      const clarification = clarifyProduct(matched, 'barcode', isMal);
      if (clarification) return clarification;
      const p = matched[0];
      const md = isMal
        ? `### 🔍 ബാർകോഡ് ഉൽപ്പന്നം: **${p.name}**\n\n` +
          `* **ബാർകോഡ്:** ${p.sku_barcode || '—'}\n` +
          `* **വില:** **${formatMoney(catalogSellingRate(p))}**\n` +
          `* **സ്റ്റോക്ക്:** ${p.current_stock || 0} ${p.uom || 'units'}\n`
        : `### 🔍 Barcode Lookup Result: **${p.name}**\n\n` +
          `* **Barcode / SKU:** ${p.sku_barcode || '—'}\n` +
          `* **Unit Price:** **${formatMoney(catalogSellingRate(p))}**\n` +
          `* **Current Stock:** ${p.current_stock || 0} ${p.uom || 'units'}\n`;

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
