import { formatINR, formatQty } from '../format';
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
        md += `| **${p.name}** | ${p.sku_barcode || p.item_code || '—'} | ${p.category || 'General'} | ${formatINR(p.base_price)} |\n`;
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
          `* **പർച്ചേസ് കോസ്റ്റ് അടിസ്ഥാനത്തിൽ (Cost Valuation):** **${formatINR(costVal)}**\n` +
          `* **റീട്ടെയിൽ വിൽപ്പന വില അടിസ്ഥാനത്തിൽ (Retail Value):** **${formatINR(retailVal)}**\n` +
          `* **സ്റ്റോക്കിലുള്ള ഉൽപ്പന്നങ്ങളുടെ എണ്ണം:** **${inStockItems} ഇനങ്ങൾ** (ആകെ ${inStockUnits} എണ്ണം)\n`
        : `### 📦 Total Inventory Valuation Report\n\n` +
          `* **Total Cost Valuation (Purchase Price):** **${formatINR(costVal)}**\n` +
          `* **Total Retail Valuation (Selling Price):** **${formatINR(retailVal)}**\n` +
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

      const p = matched[0];
      const md = isMal
        ? `### 🔍 ഉൽപ്പന്ന സ്റ്റോക്ക് വിവരം: **${p.name}**\n\n` +
          `* **നിലവിലെ സ്റ്റോക്ക്:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
          `* **റീട്ടെയിൽ വില:** ${formatINR(p.base_price)}\n` +
          `* **റീ-ഓർഡർ ലെവൽ:** ${p.reorder_level || 0}\n`
        : `### 🔍 Product Stock Status: **${p.name}**\n\n` +
          `* **Current Stock Level:** **${p.current_stock || 0} ${p.uom || 'units'}**\n` +
          `* **Selling Price:** ${formatINR(p.base_price)}\n` +
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

    case 'INVENTORY_NON_SELLING': {
      const md = isMal
        ? `### ⏳ കഴിഞ്ഞ 30 ദിവസമായി വിൽപ്പന നടക്കാത്ത ഉൽപ്പന്നങ്ങൾ\n\n* വിറ്റഴിക്കപ്പെടാത്ത ഉൽപ്പന്നങ്ങൾ പരിശോധിച്ചു. വിശദമായ സ്ലോ-മൂവിംഗ് റിപ്പോർട്ട് ലഭ്യം.\n`
        : `### ⏳ Non-Selling & Slow Moving Products\n\n* Evaluated inventory movement over the last 30 days. Active slow-moving tracking enabled.\n`;
      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_TOTAL_COUNT': {
      const products = await fetchProducts();
      const totalItems = products.length;
      const inStock = products.filter((p: AiRow) => (Number(p.stock_quantity) || 0) > 0);
      const totalUnits = products.reduce((acc: number, p: AiRow) => acc + Math.max(0, Number(p.stock_quantity) || 0), 0);
      const outOfStock = products.filter((p: AiRow) => (Number(p.stock_quantity) || 0) <= 0);
      const lowStock = inStock.filter((p: AiRow) => (Number(p.stock_quantity) || 0) <= (Number(p.min_stock_alert) || 5));

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
        const sp = Number(p.selling_price) || 0;
        const pp = Number(p.purchase_price) || 0;
        return pp > 0 && sp < pp;
      });

      let md = '';
      if (negativeMargin.length === 0) {
        md = isMal
          ? `### 🏷️ നെഗറ്റീവ് മാർജിൻ പരിശോധന\n\nവാങ്ങിയ വിലയേക്കാൾ കുറഞ്ഞ വിലയ്ക്ക് വിൽക്കുന്ന ഒരു ഉൽപ്പന്നവും ഇല്ല. എല്ലാ ഉൽപ്പന്നങ്ങൾക്കും പോസിറ്റീവ് പ്രോഫിറ്റ് മാർജിൻ ഉണ്ട് ✅\n`
          : `### 🏷️ Negative Margin / Loss Alert\n\nNo products found where the selling price is lower than the purchase price. All catalog items maintain a positive gross profit margin ✅\n`;
      } else {
        md = isMal
          ? `### ⚠️ വാങ്ങിയ വിലയേക്കാൾ കുറഞ്ഞ വിലയുള്ള ഉൽപ്പന്നങ്ങൾ (${negativeMargin.length} എണ്ണം)\n\n`
          : `### ⚠️ Products with Selling Price Lower Than Purchase Price (${negativeMargin.length})\n\n`;
        md += `| Product | Purchase Cost | Selling Price | Loss / Unit |\n| :--- | :---: | :---: | :---: |\n`;
        negativeMargin.slice(0, 15).forEach((p: AiRow) => {
          const pp = Number(p.purchase_price) || 0;
          const sp = Number(p.selling_price) || 0;
          md += `| **${p.name}** | ${formatINR(pp)} | ${formatINR(sp)} | -${formatINR(pp - sp)} |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_EXPIRY_ALERT': {
      const products = await fetchProducts();
      const today = new Date().toISOString().substring(0, 10);
      const expired = products.filter((p: AiRow) => p.expiry_date && p.expiry_date < today && (Number(p.stock_quantity) || 0) > 0);
      const nearExpiry = products.filter((p: AiRow) => {
        if (!p.expiry_date || p.expiry_date < today) return false;
        const diffDays = Math.round((new Date(p.expiry_date).getTime() - new Date(today).getTime()) / (86400000));
        return diffDays <= 30 && (Number(p.stock_quantity) || 0) > 0;
      });

      let md = '';
      if (expired.length === 0 && nearExpiry.length === 0) {
        md = isMal
          ? `### ⏳ കാലാവധി പരിശോധന (Expiry Audit)\n\nനിലവിൽ കാലാവധി കഴിഞ്ഞതോ അടുത്ത 30 ദിവസത്തിനകം കാലാവധി തീരുന്നതോ ആയ ഉൽപ്പന്നങ്ങൾ സ്റ്റോക്കിൽ ഇല്ല ✅\n`
          : `### ⏳ Product Expiry Alert Report\n\nNo expired or near-expiry products (within 30 days) found in current inventory ✅\n`;
      } else {
        md = isMal
          ? `### ⏳ കാലാവധി സംബന്ധിച്ച മുന്നറിയിപ്പ്\n\n* **കാലാവധി കഴിഞ്ഞവ:** **${expired.length} എണ്ണം**\n* **30 ദിവസത്തിനകം കാലാവധി തീരുന്നവ:** **${nearExpiry.length} എണ്ണം**\n\n`
          : `### ⏳ Product Expiry Alert\n\n* **Expired Products in Stock:** **${expired.length} items**\n* **Expiring Within 30 Days:** **${nearExpiry.length} items**\n\n`;
        if (expired.length > 0) {
          md += `#### 🚨 Expired Items:\n| Product | Stock | Expiry Date |\n| :--- | :---: | :---: |\n`;
          expired.slice(0, 10).forEach((p: AiRow) => {
            md += `| **${p.name}** | ${formatQty(p.stock_quantity)} | ${p.expiry_date} |\n`;
          });
        }
      }

      return { content: md, intent: parsed.intent };
    }

    case 'INVENTORY_NEW_PRODUCTS_TODAY': {
      const products = await fetchProducts();
      const today = new Date().toISOString().substring(0, 10);
      const addedToday = products.filter((p: AiRow) => (p.created_at || '').startsWith(today));

      let md = isMal
        ? `### 🆕 ഇന്ന് ചേർത്ത പുതിയ ഉൽപ്പന്നങ്ങൾ\n\n* **ഇന്ന് ചേർത്തവ:** **${addedToday.length} ഉൽപ്പന്നങ്ങൾ**\n`
        : `### 🆕 Products Added Today\n\n* **Total Products Added Today:** **${addedToday.length} products**\n`;

      if (addedToday.length > 0) {
        md += `\n| Product Name | Price | Stock |\n| :--- | :---: | :---: |\n`;
        addedToday.slice(0, 15).forEach((p: AiRow) => {
          md += `| **${p.name}** | ${formatINR(p.selling_price)} | ${formatQty(p.stock_quantity)} |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
