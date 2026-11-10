import { clarifyProduct } from '../productSelection';
import { nonSellingStockReply } from './nonSellingStock';
import { getStoreBusinessDate } from '../../../utils/time/timezoneHelper';
import { productExpiryReply } from './productExpiry';
import { catalogSellingRate } from '../catalogPrice';
import { formatMoney, formatQty } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Stock levels, stock value, margins, expiry and new products. */
export async function handleInventoryIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { isMal, fetchProducts } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 11. Inventory & Stock (4.2)
    // ──────────────────────────────────────────────────────────────────────
    case 'INVENTORY_OUT_OF_STOCK': {
      const prods = await fetchProducts();
      const outOfStock = prods.filter((p: AiRow) => Number(p.current_stock || 0) <= 0);

      let md = isMal
        ? `### 🔴 തീർന്നുപോയ ഉൽപ്പന്നങ്ങൾ (Out of Stock)\n\n` +
          `നിലവിൽ സ്റ്റോക്ക് തീർന്നുപോയ **${outOfStock.length}** ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി:\n\n` +
          `| ഉൽപ്പന്നം | ബാർകോഡ് | കാറ്റഗറി | സെല്ലിംഗ് പ്രൈസ് |\n| :--- | :---: | :--- | :---: |\n`
        : `### 🔴 Out of Stock Products\n\n` +
          `Found **${outOfStock.length} products** with zero or negative inventory:\n\n` +
          `| Product Name | Barcode / Code | Category | Unit Price |\n| :--- | :---: | :--- | :---: |\n`;

      outOfStock.slice(0, 15).forEach((p: AiRow) => {
        md += `| **${p.name}** | ${p.sku_barcode || p.item_code || '—'} | ${p.category || 'General'} | ${formatMoney(catalogSellingRate(p))} |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_LOW_STOCK':
    case 'LOW_STOCK_ALERT': {
      const prods = await fetchProducts();
      const low = prods.filter((p: AiRow) => Number(p.current_stock || 0) <= Number(p.reorder_level || 0));
      const out = low.filter((p: AiRow) => Number(p.current_stock || 0) <= 0);

      let md = isMal
        ? `### ⚠️ സ്റ്റോക്ക് മുന്നറിയിപ്പ് (Low Stock Alert)\n\nറീ-ഓർഡർ ലെവലിൽ എത്തിയ **${low.length}** ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി (ഇതിൽ **${out.length}** എണ്ണം തീർന്നുപോയി):\n\n| ഉൽപ്പന്നം | കാറ്റഗറി | സ്റ്റോക്ക് | റീ-ഓർഡർ | സ്റ്റാറ്റസ് |\n| :--- | :--- | :---: | :---: | :---: |\n`
        : `### ⚠️ Low Stock Alert\n\nFound **${low.length} products** at or below reorder level (**${out.length}** out of stock):\n\n| Product | Category | Current Stock | Reorder Level | Status |\n| :--- | :--- | :---: | :---: | :---: |` + '\n';

      low.slice(0, 15).forEach((p: AiRow) => {
        const isZero = Number(p.current_stock) <= 0;
        const status = isMal ? (isZero ? '🔴 തീർന്നു' : '🟡 കുറവ്') : (isZero ? '🔴 Out of Stock' : '🟡 Low Stock');
        md += `| **${p.name}** | ${p.category || 'General'} | **${p.current_stock}** | ${p.reorder_level || 0} | ${status} |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_TOTAL_VALUE': {
      const prods = await fetchProducts();
      let costVal = 0;
      let retailVal = 0;
      let inStockUnits = 0;
      let inStockItems = 0;

      prods.forEach((p: AiRow) => {
        const qty = Number(p.current_stock) || 0;
        if (qty > 0) {
          inStockItems++;
          inStockUnits += qty;
          costVal += qty * (Number(p.purchase_price) || 0);
          retailVal += qty * (Number(p.base_price) || 0);
        }
      });

      const md = isMal
        ? `### 📦 ആകെ ഇൻവെന്ററി മൂല്യം (Total Inventory Valuation)\n\n` +
          `* **പർച്ചേസ് കോസ്റ്റ് അടിസ്ഥാനത്തിൽ (Cost Valuation):** **${formatMoney(costVal)}**\n` +
          `* **റീട്ടെയിൽ വിൽപ്പന വില അടിസ്ഥാനത്തിൽ (Retail Value):** **${formatMoney(retailVal)}**\n` +
          `* **സ്റ്റോക്കിലുള്ള ഉൽപ്പന്നങ്ങളുടെ എണ്ണം:** **${inStockItems} ഇനങ്ങൾ** (ആകെ ${inStockUnits} എണ്ണം)\n`
        : `### 📦 Total Inventory Valuation Report\n\n` +
          `* **Total Cost Valuation (Purchase Price):** **${formatMoney(costVal)}**\n` +
          `* **Total Retail Valuation (Selling Price):** **${formatMoney(retailVal)}**\n` +
          `* **Active In-Stock Items:** **${inStockItems} products** (Total ${inStockUnits} units)\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_PRODUCT_STOCK': {
      const prods = await fetchProducts();
      const term = (parsed.params.productName || '').toLowerCase().trim();
      const matched = prods.filter((p: AiRow) =>
        p.name?.toLowerCase().includes(term) || (p.sku_barcode && p.sku_barcode.includes(term))
      );

      if (matched.length === 0) {
        return { content: isMal ? `"${term}" എന്ന ഉൽപ്പന്നം കണ്ടെത്താനായില്ല.` : `Could not find product matching "${term}".` };
      }

      const clarification = clarifyProduct(matched, 'stock', isMal);
      if (clarification) return clarification;
      const p = matched[0];
      const md = isMal
        ? `### 🔍 ഉൽപ്പന്ന സ്റ്റോക്ക് വിവരം: **${p.name}**\n\n` +
          `* **നിലവിലെ സ്റ്റോക്ക്:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
          `* **റീട്ടെയിൽ വില:** ${formatMoney(catalogSellingRate(p))}\n` +
          `* **റീ-ഓർഡർ ലെവൽ:** ${p.reorder_level || 0}\n`
        : `### 🔍 Product Stock Status: **${p.name}**\n\n` +
          `* **Current Stock Level:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
          `* **Selling Price:** ${formatMoney(catalogSellingRate(p))}\n` +
          `* **Reorder Level:** ${p.reorder_level || 0}\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_TOP_STOCK': {
      const prods = await fetchProducts();
      const sorted = prods.sort((a: AiRow, b: AiRow) => (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0)).slice(0, 10);

      let md = isMal
        ? `### 📈 കൂടുതൽ സ്റ്റോക്കുള്ള ഉൽപ്പന്നങ്ങൾ\n\n| ഉൽപ്പന്നം | സ്റ്റോക്ക് | കാറ്റഗറി |\n| :--- | :---: | :--- |\n`
        : `### 📈 Products with Highest Stock Quantity\n\n| Product Name | Current Stock | Category |\n| :--- | :---: | :--- |\n`;

      sorted.forEach((p: AiRow) => {
        md += `| **${p.name}** | **${p.current_stock || 0}** | ${p.category || 'General'} |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_BY_CATEGORY': {
      const prods = await fetchProducts();
      const catMap: Record<string, { items: number; totalStock: number }> = {};
      prods.forEach((p: AiRow) => {
        const c = p.category || 'General';
        if (!catMap[c]) catMap[c] = { items: 0, totalStock: 0 };
        catMap[c].items++;
        catMap[c].totalStock += Number(p.current_stock) || 0;
      });

      let md = isMal
        ? `### 🗂️ കാറ്റഗറി തിരിച്ചുള്ള സ്റ്റോക്ക്\n\n| കാറ്റഗറി | ഇനങ്ങൾ | ആകെ സ്റ്റോക്ക് |\n| :--- | :---: | :---: |\n`
        : `### 🗂️ Stock by Product Category\n\n| Category | Items Count | Total Stock Units |\n| :--- | :---: | :---: |\n`;

      Object.keys(catMap).forEach(k => {
        md += `| **${k}** | ${catMap[k].items} | **${catMap[k].totalStock}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_NON_SELLING': return nonSellingStockReply(parsed, ctx);

    case 'INVENTORY_TOTAL_COUNT': {
      const products = await fetchProducts();
      const totalItems = products.length;
      const inStock = products.filter((p: AiRow) => (Number(p.current_stock ?? p.stock_quantity) || 0) > 0);
      const totalUnits = products.reduce((acc: number, p: AiRow) => acc + Math.max(0, Number(p.current_stock ?? p.stock_quantity) || 0), 0);
      const outOfStock = products.filter((p: AiRow) => (Number(p.current_stock ?? p.stock_quantity) || 0) <= 0);
      const lowStock = inStock.filter((p: AiRow) => (Number(p.current_stock ?? p.stock_quantity) || 0) <= (Number(p.reorder_level ?? p.min_stock_alert) || 0));

      const md = isMal
        ? `### 📦 ഇൻവെന്ററി ആകെ ഉൽപ്പന്നങ്ങൾ\n\n` +
          `* **ആകെ കാറ്റലോഗ് ഉൽപ്പന്നങ്ങൾ:** **${totalItems} എണ്ണം**\n` +
          `* **സ്റ്റോക്കുള്ള ഉൽപ്പന്നങ്ങൾ:** **${inStock.length} ഇനങ്ങൾ**\n` +
          `* **ആകെ ഫിസിക്കൽ സ്റ്റോക്ക് യൂണിറ്റുകൾ:** **${formatQty(totalUnits)} എണ്ണം**\n` +
          `* **സ്റ്റോക്ക് കുറഞ്ഞവ (Low Stock):** **${lowStock.length} ഇനങ്ങൾ**\n` +
          `* **സ്റ്റോക്ക് തീർന്നവ (Out of Stock):** **${outOfStock.length} ഇനങ്ങൾ**\n`
        : `### 📦 Inventory Stock Count Summary\n\n` +
          `* **Total Catalog Products:** **${totalItems} products**\n` +
          `* **Active Products In Stock:** **${inStock.length} products**\n` +
          `* **Total Physical Stock Units:** **${formatQty(totalUnits)} units**\n` +
          `* **Low Stock Items:** **${lowStock.length} products**\n` +
          `* **Out of Stock Items:** **${outOfStock.length} products**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_NEGATIVE_MARGIN': {
      const products = await fetchProducts();
      const negativeMargin = products.filter((p: AiRow) => {
        const sp = catalogSellingRate(p);
        const pp = Number(p.purchase_price) || 0;
        return pp > 0 && (p.base_price != null || p.offer_price != null || p.selling_price != null) && sp < pp;
      });

      let md = '';
      if (negativeMargin.length === 0) {
        md = isMal
          ? `### 🏷️ നെഗറ്റീവ് മാർജിൻ പരിശോധന\n\nതാരതമ്യം ചെയ്യാൻ വില ലഭ്യമായ ഉൽപ്പന്നങ്ങളിൽ വാങ്ങിയ വിലയേക്കാൾ കുറഞ്ഞ catalog വില കണ്ടെത്തിയില്ല. ഇത് യഥാർത്ഥ ലാഭത്തിന്റെ കണക്കല്ല.\n`
          : `### 🏷️ Negative Margin / Loss Alert\n\nNo comparable catalog selling prices below the recorded purchase price were found. This is a catalog-price comparison, not realized profit.\n`;
      } else {
        md = isMal
          ? `### ⚠️ വാങ്ങിയ വിലയേക്കാൾ കുറഞ്ഞ വിലയുള്ള ഉൽപ്പന്നങ്ങൾ (${negativeMargin.length} എണ്ണം)\n\n`
          : `### ⚠️ Products with Selling Price Lower Than Purchase Price (${negativeMargin.length})\n\n`;
        md += `| Product | Purchase Cost | Selling Price | Loss / Unit |\n| :--- | :---: | :---: | :---: |\n`;
        negativeMargin.slice(0, 15).forEach((p: AiRow) => {
          const pp = Number(p.purchase_price) || 0;
          const sp = catalogSellingRate(p);
          md += `| **${p.name}** | ${formatMoney(pp)} | ${formatMoney(sp)} | -${formatMoney(pp - sp)} |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_EXPIRY_ALERT': return productExpiryReply(await fetchProducts(), isMal);

    case 'INVENTORY_NEW_PRODUCTS_TODAY': {
      const products = await fetchProducts();
      const today = getStoreBusinessDate();
      const addedToday = products.filter((p: AiRow) => p.created_at && getStoreBusinessDate(undefined, p.created_at) === today);

      let md = isMal
        ? `### 🆕 ഇന്ന് ചേർത്ത പുതിയ ഉൽപ്പന്നങ്ങൾ\n\n* **ഇന്ന് ചേർത്തവ:** **${addedToday.length} ഉൽപ്പന്നങ്ങൾ**\n`
        : `### 🆕 Products Added Today\n\n* **Total Products Added Today:** **${addedToday.length} products**\n`;

      if (addedToday.length > 0) {
        md += `\n| Product Name | Price | Stock |\n| :--- | :---: | :---: |\n`;
        addedToday.slice(0, 15).forEach((p: AiRow) => {
          md += `| **${p.name}** | ${formatMoney(catalogSellingRate(p))} | ${formatQty(p.current_stock ?? p.stock_quantity)} |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
