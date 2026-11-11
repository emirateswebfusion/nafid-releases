import { roundMoney } from '../../../utils/pricing/moneyRounding';
import { cancelledInvoicesReply } from './cancelledInvoices';
import { parseUTCDate } from '../../../utils/time/utc';
import { hasBridge } from '../../../data/client';
import { productsApi } from '../../../data/products';
import { resolveDateRange } from '../dates';
import { formatMoney, formatQty } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Sales rankings and lists: best month/day, staff, customers, counters, top products, invoice lists. */
export async function handleSalesDetailIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { tenantId, isMal, fetchInvoices } = ctx;
  switch (parsed.intent) {
    case 'SALES_HIGHEST_MONTH': {
      const isLowest = !!parsed.params?.isLowest;
      const targetYear = parsed.params?.year;
      const fromDate = targetYear ? `${targetYear}-01-01` : '2000-01-01';
      const toDate = targetYear ? `${targetYear}-12-31` : '2099-12-31';

      const invs = await fetchInvoices(fromDate, toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type as string));

      if (validInvs.length === 0) {
        const emptyMsg = targetYear
          ? (isMal ? `${targetYear}-ൽ സെയിൽസ് റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല.` : `No sales records found for the year ${targetYear}.`)
          : (isMal ? 'സെയിൽസ് റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല.' : 'No sales records found in the system.');
        return { content: emptyMsg, intent: parsed.intent };
      }

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const malMonthNames = [
        'ജനുവരി', 'ഫെബ്രുവരി', 'മാർച്ച്', 'ഏപ്രിൽ', 'മേയ്', 'ജൂൺ',
        'ജൂലൈ', 'ഓഗസ്റ്റ്', 'സെപ്റ്റംബർ', 'ഒക്ടോബർ', 'നവംബർ', 'ഡിസംബർ'
      ];

      const monthMap: Record<string, { key: string; label: string; year: number; monthNum: number; sales: number; count: number }> = {};

      validInvs.forEach((i: AiRow) => {
        const dateStr = (i.created_at || '').slice(0, 10);
        if (!dateStr || dateStr.length < 7) return;
        const monthKey = dateStr.slice(0, 7);
        const [yStr, mStr] = monthKey.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        if (!monthMap[monthKey]) {
          const mIdx = Math.max(0, Math.min(11, m - 1));
          const label = isMal ? `${malMonthNames[mIdx]} ${y}` : `${monthNames[mIdx]} ${y}`;
          monthMap[monthKey] = { key: monthKey, label, year: y, monthNum: m, sales: 0, count: 0 };
        }
        monthMap[monthKey].sales += Number(i.grand_total) || 0;
        monthMap[monthKey].count += 1;
      });

      const monthsArray = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key));
      if (monthsArray.length === 0) {
        return { content: isMal ? 'സെയിൽസ് റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല.' : 'No sales records found.', intent: parsed.intent };
      }

      const sortedBySales = [...monthsArray].sort((a, b) => b.sales - a.sales);
      const highestMonth = sortedBySales[0];
      const lowestMonth = sortedBySales[sortedBySales.length - 1];
      const targetMonth = isLowest ? lowestMonth : highestMonth;

      const title = isLowest
        ? (isMal ? 'ഏറ്റവും കുറഞ്ഞ വിൽപ്പന നടന്ന മാസം' : 'Lowest Sales Month')
        : (isMal ? 'ഏറ്റവും കൂടുതൽ വിൽപ്പന നടന്ന മാസം' : 'Highest Sales Month');

      const periodLabel = targetYear ? (isMal ? `${targetYear} വർഷം` : `Year ${targetYear}`) : (isMal ? 'എല്ലാ സമയത്തെയും' : 'All-Time');

      let md = isMal
        ? `### 🏆 ${title} (${periodLabel})\n\n` +
          `* **മാസം:** **${targetMonth.label}**\n` +
          `* **ആകെ വിൽപ്പന:** **${formatMoney(targetMonth.sales)}**\n` +
          `* **ബില്ലുകളുടെ എണ്ണം:** **${targetMonth.count} എണ്ണം**\n` +
          `* **ശരാശരി ബിൽ തുക:** **${formatMoney(targetMonth.count > 0 ? targetMonth.sales / targetMonth.count : 0)}**\n\n` +
          `#### 📊 മാസ തിരിച്ചുള്ള വിൽപ്പന വിവരങ്ങൾ:\n\n` +
          `| മാസം | ബില്ലുകൾ | ആകെ വിൽപ്പന |\n| :--- | :---: | :---: |\n`
        : `### 🏆 ${title} (${periodLabel})\n\n` +
          `* **Month:** **${targetMonth.label}**\n` +
          `* **Total Sales Revenue:** **${formatMoney(targetMonth.sales)}**\n` +
          `* **Total Invoices:** **${targetMonth.count} bills**\n` +
          `* **Average Ticket Value:** **${formatMoney(targetMonth.count > 0 ? targetMonth.sales / targetMonth.count : 0)}**\n\n` +
          `#### 📊 Monthly Sales Breakdown:\n\n` +
          `| Month | Invoices | Total Sales Revenue |\n| :--- | :---: | :---: |\n`;

      monthsArray.forEach(m => {
        const isTarget = m.key === targetMonth.key;
        const prefix = isTarget ? (isLowest ? '🔻 ' : '⭐ ') : '';
        const nameDisplay = isTarget ? `**${prefix}${m.label}**` : `${m.label}`;
        md += `| ${nameDisplay} | ${m.count} | **${formatMoney(m.sales)}** |\n`;
      });

      const chartItems = monthsArray.map(m => ({
        month: m.label,
        sales: roundMoney(m.sales),
        invoices: m.count,
      }));

      const suggestedPrompts = isMal
        ? [
            'ഈ മാസത്തെ മൊത്തം വിൽപ്പന എത്രയാണ്?',
            'ഏറ്റവും കൂടുതൽ സെയിൽസ് നടന്ന ദിവസം ഏതാണ്?',
            'കൂടുതൽ വിറ്റഴിഞ്ഞ ഉൽപ്പന്നങ്ങൾ ഏവ?'
          ]
        : [
            'What are today\'s total sales?',
            'Which day had the highest sales this month?',
            'Top selling products this month'
          ];

      return {
        content: md,
        intent: parsed.intent,
        domain: 'SALES',
        chartData: {
          type: 'bar',
          title: isMal ? 'പ്രതിമാസ വിൽപ്പന താരതമ്യം' : 'Monthly Sales Performance',
          labelKey: 'month',
          dataKey: 'sales',
          items: chartItems,
        },
        suggestedPrompts,
      };
    }

    case 'SALES_HIGHEST_DAY':
    case 'SALES_DAILY_TREND': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const dailyMap: Record<string, { date: string; sales: number; count: number }> = {};
      validInvs.forEach((i: AiRow) => {
        const d = (i.created_at || '').slice(0, 10) || range.fromDate;
        if (!dailyMap[d]) dailyMap[d] = { date: d, sales: 0, count: 0 };
        dailyMap[d].sales += Number(i.grand_total) || 0;
        dailyMap[d].count += 1;
      });

      const dailyArray = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      if (dailyArray.length === 0) {
        return { content: isMal ? 'ഈ കാലയളവിൽ സെയിൽസ് ഒന്നും ലഭ്യമല്ല.' : `No sales recorded for ${range.label}.` };
      }

      const sortedBySales = [...dailyArray].sort((a, b) => b.sales - a.sales);
      const highestDay = sortedBySales[0];
      const lowestDay = sortedBySales[sortedBySales.length - 1];

      let md = '';
      if (parsed.intent === 'SALES_HIGHEST_DAY') {
        const targetDay = parsed.params.isLowest ? lowestDay : highestDay;
        const labelTitle = parsed.params.isLowest
          ? (isMal ? 'ഏറ്റവും കുറഞ്ഞ സെയിൽസ് നടന്ന ദിവസം' : 'Lowest Sales Day')
          : (isMal ? 'ഏറ്റവും കൂടുതൽ സെയിൽസ് നടന്ന ദിവസം' : 'Highest Sales Day');

        md = isMal
          ? `### 🏆 ${labelTitle} (${range.label})\n\n` +
            `* **തിയതി:** **${targetDay.date}**\n` +
            `* **വിൽപ്പന തുക:** **${formatMoney(targetDay.sales)}**\n` +
            `* **ബില്ലുകളുടെ എണ്ണം:** **${targetDay.count} എണ്ണം**\n`
          : `### 🏆 ${labelTitle} (${range.label})\n\n` +
            `* **Date:** **${targetDay.date}**\n` +
            `* **Sales Revenue:** **${formatMoney(targetDay.sales)}**\n` +
            `* **Invoices Count:** **${targetDay.count} invoices**\n`;
      } else {
        md = isMal
          ? `### 📈 പ്രതിദിന സെയിൽസ് ട്രെൻഡ് (ബില്ലുള്ള ദിവസങ്ങൾ) — ${range.label}\n\n` +
            `* **കൂടുതൽ വിൽപ്പന നടന്ന ദിവസം:** **${highestDay.date}** (${formatMoney(highestDay.sales)})\n` +
            `* **കുറഞ്ഞ വിൽപ്പന നടന്ന ദിവസം:** **${lowestDay.date}** (${formatMoney(lowestDay.sales)})\n\n` +
            `| തിയതി | ബില്ലുകൾ | വിൽപ്പന തുക |\n| :---: | :---: | :---: |\n`
          : `### 📈 Daily Sales Trend (recorded invoice dates) — ${range.label}\n\n` +
            `* **Best Performing Day:** **${highestDay.date}** (${formatMoney(highestDay.sales)})\n` +
            `* **Lowest Performing Day:** **${lowestDay.date}** (${formatMoney(lowestDay.sales)})\n\n` +
            `| Date | Invoices | Total Sales |\n| :---: | :---: | :---: |\n`;

        dailyArray.slice(-10).forEach(d => {
          md += `| ${d.date} | ${d.count} | **${formatMoney(d.sales)}** |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_BILLER_STAFF': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const billerMap: Record<string, { name: string; count: number; total: number }> = {};
      validInvs.forEach((i: AiRow) => {
        const name = i.biller_name || i.biller_staff_name || 'Admin / Suhaib';
        if (!billerMap[name]) billerMap[name] = { name, count: 0, total: 0 };
        billerMap[name].count += 1;
        billerMap[name].total += Number(i.grand_total) || 0;
      });

      const list = Object.values(billerMap).sort((a, b) => b.total - a.total);

      let md = isMal
        ? `### 👨‍💼 ബില്ലർ തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
          `| ബില്ലർ | ബില്ലുകൾ | ആകെ വിൽപ്പന |\n| :--- | :---: | :---: |\n`
        : `### 👨‍💼 Sales by Biller / Cashier — ${range.label}\n\n` +
          `| Biller / Cashier | Invoices | Total Revenue |\n| :--- | :---: | :---: |\n`;

      list.forEach(b => {
        md += `| **${b.name}** | ${b.count} bills | **${formatMoney(b.total)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_CUSTOMER_LEVEL': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const custMap: Record<string, { name: string; phone: string; count: number; total: number }> = {};
      validInvs.forEach((i: AiRow) => {
        const name = i.customer_name || 'Walk-in Customer';
        if (name === 'Walk-in Customer') return;
        const phone = i.customer_phone || '';
        const key = (name + '_' + phone).toLowerCase();
        if (!custMap[key]) custMap[key] = { name, phone, count: 0, total: 0 };
        custMap[key].count += 1;
        custMap[key].total += Number(i.grand_total) || 0;
      });

      const list = Object.values(custMap).sort((a, b) => b.total - a.total);

      let md = isMal
        ? `### 👑 കൂടുതൽ വാങ്ങിയ ഉപഭോക്താക്കൾ — ${range.label}\n\n` +
          `| കസ്റ്റമർ | ഫോൺ | ബില്ലുകൾ | ആകെ പർച്ചേസ് |\n| :--- | :---: | :---: | :---: |\n`
        : `### 👑 Top Purchasing Customers — ${range.label}\n\n` +
          `| Customer Name | Phone | Bills | Total Purchases |\n| :--- | :---: | :---: | :---: |\n`;

      list.slice(0, 10).forEach(c => {
        md += `| **${c.name}** | ${c.phone || '—'} | ${c.count} | **${formatMoney(c.total)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_CANCELLED_INVOICES': return cancelledInvoicesReply(ctx);

    case 'TOP_SELLING_PRODUCTS': {
      const range = resolveDateRange(parsed.params.rangeType || (parsed.params.customFrom ? 'custom' : 'today'), parsed.params.customFrom, parsed.params.customTo, isMal);
      let summaryList: Awaited<ReturnType<typeof productsApi.getProductSalesSummary>> = [];
      if (hasBridge('dbGetProductSalesSummary')) {
        try {
          summaryList = await productsApi.getProductSalesSummary({
            tenant_id: tenantId,
            fromDate: range.fromDate,
            toDate: range.toDate,
          });
        } catch { /* ignore */ }
      }

      const limit = parsed.params.limit || 5;
      let md = isMal
        ? `### 🏆 കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ — ${range.label}\n\n`
        : `### 🏆 Top Selling Products — ${range.label}\n\n`;

      if (summaryList && summaryList.length > 0) {
        const topProduct = summaryList[0];
        md += isMal
          ? `* **ഒന്നാം സ്ഥാനം:** **${topProduct.name}** (${topProduct.total_qty || topProduct.gst_qty || 0} എണ്ണം, ${formatMoney(topProduct.total_revenue || 0)})\n\n` +
            `| ഉൽപ്പന്നം | വിറ്റ അളവ് | ആകെ വരുമാനം |\n| :--- | :---: | :---: |\n`
          : `* **#1 Top Seller:** **${topProduct.name}** (${topProduct.total_qty || topProduct.gst_qty || 0} sold, ${formatMoney(topProduct.total_revenue || 0)})\n\n` +
            `| Product Name | Qty Sold | Revenue |\n| :--- | :---: | :---: |\n`;

        summaryList.slice(0, limit).forEach((p, idx) => {
          const prefix = idx === 0 ? '⭐ ' : '';
          md += `| ${prefix}**${p.name}** | ${p.total_qty || p.gst_qty || 0} | **${formatMoney(p.total_revenue || 0)}** |\n`;
        });
      } else {
        md += isMal ? `ഈ കാലയളവിൽ ഉൽപ്പന്ന വിൽപ്പനകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല (${range.label}).` : `No product sales recorded for ${range.label}.`;
      }

      const chartItems = (summaryList || []).slice(0, limit).map((p: Awaited<ReturnType<typeof productsApi.getProductSalesSummary>>[number]) => ({
        product: p.name,
        qty: p.total_qty || p.gst_qty || 0,
        revenue: roundMoney((Number(p.total_revenue) || 0)),
      }));

      const suggestedPrompts = isMal
        ? [
            'ഈ മാസത്തെ മൊത്തം വിൽപ്പന എത്രയാണ്?',
            'ഏറ്റവും കൂടുതൽ വരുമാനം തന്ന ഉൽപ്പന്നം ഏതാണ്?',
            'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ ഏവ?'
          ]
        : [
            'What are today\'s total sales?',
            'Which product generated the highest revenue?',
            'Which products are out of stock right now?'
          ];

      return {
        content: md,
        intent: parsed.intent,
        domain: 'SALES',
        chartData: chartItems.length > 0 ? {
          type: 'bar',
          title: isMal ? `കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ — ${range.label}` : `Top Selling Products — ${range.label}`,
          labelKey: 'product',
          dataKey: 'qty',
          items: chartItems,
        } : undefined,
        suggestedPrompts,
      };
    }

    case 'SALES_BY_COUNTER': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type as string));

      const counterMap: Record<string, { count: number; total: number; cash: number; digital: number }> = {};
      validInvs.forEach((inv: AiRow) => {
        const cName = inv.counter_name || inv.biller_name || inv.created_by_name || 'Counter 1 (Main)';
        if (!counterMap[cName]) {
          counterMap[cName] = { count: 0, total: 0, cash: 0, digital: 0 };
        }
        const amt = Number(inv.grand_total) || 0;
        counterMap[cName].count += 1;
        counterMap[cName].total += amt;
        const method = String(inv.payment_method || '').toUpperCase();
        if (method === 'CASH') {
          counterMap[cName].cash += amt;
        } else {
          counterMap[cName].digital += amt;
        }
      });

      const counters = Object.entries(counterMap);

      let md = isMal
        ? `### ⚖️ കൗണ്ടർ തിരിച്ചുള്ള വിൽപ്പന താരതമ്യം (${range.label})\n\n`
        : `### ⚖️ Sales Comparison Across Billing Counters (${range.label})\n\n`;

      if (counters.length === 0) {
        md += isMal ? `ഇന്ന് ഇതുവരെ കൗണ്ടറുകളിൽ വിൽപ്പന രേഖപ്പെടുത്തിയിട്ടില്ല.\n` : `No billing activity recorded across counters today yet.\n`;
      } else {
        md += `| Counter / Register | Invoices | Cash Sales | Digital / UPI | Total Sales |\n| :--- | :---: | :---: | :---: | :---: |\n`;
        counters.forEach(([name, data]) => {
          md += `| **${name}** | ${data.count} bills | ${formatMoney(data.cash)} | ${formatMoney(data.digital)} | **${formatMoney(data.total)}** |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_LATEST_INVOICE_NUMBER': {
      const invs = await fetchInvoices('2000-01-01', '2099-12-31');
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type as string));
      const sorted = [...validInvs].sort((a: AiRow, b: AiRow) => {
        const tA = parseUTCDate(a.created_at || a.invoice_date || 0).getTime();
        const tB = parseUTCDate(b.created_at || b.invoice_date || 0).getTime();
        return tB - tA;
      });
      const latest = sorted[0];

      let md: string;
      if (!latest) {
        md = isMal
          ? `### 🧾 ഏറ്റവും പുതിയ ഇൻവോയ്സ്\n\nഇതുവരെ ഇൻവോയ്സുകളൊന്നും ഉണ്ടാക്കിയിട്ടില്ല.\n`
          : `### 🧾 Latest Invoice Number\n\nNo invoices recorded in the system yet.\n`;
      } else {
        md = isMal
          ? `### 🧾 ഏറ്റവും പുതിയ ഇൻവോയ്സ് വിവരങ്ങൾ\n\n` +
            `* **ഇൻവോയ്സ് നമ്പർ (Invoice #):** **${latest.invoice_number}**\n` +
            `* **തീയതി:** **${latest.invoice_date || (latest.created_at || '').substring(0, 10)}**\n` +
            `* **കസ്റ്റമർ:** **${latest.customer_name || 'Walk-in Customer'}**\n` +
            `* **ബിൽ തുക:** **${formatMoney(latest.grand_total)}**\n`
          : `### 🧾 Latest Invoice Details\n\n` +
            `* **Latest Invoice Number:** **${latest.invoice_number}**\n` +
            `* **Date / Timestamp:** **${latest.invoice_date || (latest.created_at || '').substring(0, 10)}**\n` +
            `* **Customer:** **${latest.customer_name || 'Walk-in Customer'}**\n` +
            `* **Invoice Grand Total:** **${formatMoney(latest.grand_total)}**\n`;
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_INVOICE_LIST': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type as string));

      let md = isMal
        ? `### 🧾 ഇന്ന് അടിച്ച ഇൻവോയ്സുകളുടെ ലിസ്റ്റ് (${validInvs.length} എണ്ണം)\n\n`
        : `### 🧾 Invoices Generated Today (${validInvs.length} bills)\n\n`;

      if (validInvs.length === 0) {
        md += isMal ? `ഇന്ന് ഇതുവരെ ഇൻവോയ്സുകൾ അടിച്ചിട്ടില്ല.\n` : `No invoices generated today yet.\n`;
      } else {
        md += `| Invoice # | Customer | Payment Mode | Grand Total |\n| :--- | :--- | :---: | :---: |\n`;
        validInvs.slice(0, 25).forEach((inv: AiRow) => {
          md += `| **${inv.invoice_number}** | ${inv.customer_name || 'Walk-in'} | ${inv.payment_method || 'Cash'} | **${formatMoney(inv.grand_total)}** |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_BILLS_CONTAINING_PRODUCT': {
      const prod = (parsed.params.productName || '').trim();
      if (!prod || /\b(specific|particular|someone|anyone)\b/i.test(prod)) {
        const md = isMal
          ? `### ❓ ഉൽപ്പന്നത്തിന്റെ പേര് വ്യക്തമാക്കുക\n\nഏത് ഉൽപ്പന്നം അടങ്ങിയ ബില്ലുകളാണ് കാണേണ്ടത് എന്ന് വ്യക്തമാക്കുക (ഉദാഹരണത്തിന്: *"Show all bills containing Milk"*).\n`
          : `### ❓ Please Specify Product Name\n\nPlease mention the specific product name to view its invoices (e.g., *"Show all bills containing Milk"* or *"Bills with CELLO MUG"*).\n`;
        return {
          content: md,
          intent: 'CLARIFICATION_REQUIRED',
          clarificationRequired: true,
          suggestedPrompts: isMal ? ['മിൽക്ക് അടങ്ങിയ ബില്ലുകൾ', 'ഷുഗർ അടങ്ങിയ ബില്ലുകൾ'] : ['Bills containing Milk', 'Bills containing Oil'],
        };
      }

      const invs = await fetchInvoices('2000-01-01', '2099-12-31');
      const matchingInvs: AiRow[] = [];
      for (const inv of invs) {
        const items = inv.items || [];
        if (items.some((it: AiRow) => (it.name || '').toLowerCase().includes(prod.toLowerCase()))) {
          matchingInvs.push(inv);
        }
      }

      let md = isMal
        ? `### 🧾 "${prod}" അടങ്ങിയ ഇൻവോയ്സുകൾ (${matchingInvs.length} എണ്ണം)\n\n`
        : `### 🧾 Invoices Containing "${prod}" (${matchingInvs.length} bills)\n\n`;

      if (matchingInvs.length === 0) {
        md += isMal ? `ഈ ഉൽപ്പന്നം അടങ്ങിയ ഇൻവോയ്സുകളൊന്നും കണ്ടെത്തിയില്ല.\n` : `No invoices found containing "${prod}".\n`;
      } else {
        md += `| Invoice # | Date | Customer | Quantity | Invoice Total |\n| :--- | :---: | :--- | :---: | :---: |\n`;
        matchingInvs.slice(0, 20).forEach((inv: AiRow) => {
          const item = (inv.items || []).find((it: AiRow) => (it.name || '').toLowerCase().includes(prod.toLowerCase()));
          md += `| **${inv.invoice_number}** | ${inv.invoice_date || (inv.created_at || '').substring(0, 10)} | ${inv.customer_name || 'Walk-in'} | ${formatQty(item?.quantity || 1)} | **${formatMoney(inv.grand_total)}** |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
