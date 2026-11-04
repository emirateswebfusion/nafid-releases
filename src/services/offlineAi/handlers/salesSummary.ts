import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { resolveDateRange } from '../dates';
import { calculatePaymentBreakdown, formatMoney, pad } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, OfflineDateRange, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Sales totals, periods, comparisons, averages, payment methods and the daily business report. */
export async function handleSalesSummaryIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { isMal, fetchInvoices, fetchSummary, fetchCashTransactions, fetchPurchaseBills, fetchReturns } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 1. Current-Day Sales / Today's Sales
    // ──────────────────────────────────────────────────────────────────────
    case 'SALES_TODAY': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const pm = calculatePaymentBreakdown(invs);

      let md = isMal
        ? `### 📊 ഇന്നത്തെ സെയിൽസ് സംഗ്രഹം (${range.label})\n\n`
        : `### 📊 Today's Sales Summary (${range.label})\n\n`;

      md += isMal
        ? `* **മൊത്തം വരുമാനം (Total Revenue):** **${formatMoney(summary.totalSales)}**\n` +
          `* **ആകെ ബില്ലുകൾ (Total Bills):** **${summary.totalInvoices} എണ്ണം**\n` +
          `* **ശരാശരി ബിൽ തുക (Avg Bill Value):** **${formatMoney(summary.avgOrder)}**\n`
        : `* **Total Sales Revenue:** **${formatMoney(summary.totalSales)}**\n` +
          `* **Total Invoices Generated:** **${summary.totalInvoices} invoices**\n` +
          `* **Average Ticket Value:** **${formatMoney(summary.avgOrder)}**\n`;

      if (summary.totalTax > 0) {
        md += isMal ? `* **ടാക്സ് (GST Collected):** ${formatMoney(summary.totalTax)}\n` : `* **Tax (GST) Collected:** ${formatMoney(summary.totalTax)}\n`;
      }
      if (summary.totalDiscount > 0) {
        md += isMal ? `* **നൽകിയ ഡിസ്കൗണ്ട് (Discounts):** ${formatMoney(summary.totalDiscount)}\n` : `* **Discounts Given:** ${formatMoney(summary.totalDiscount)}\n`;
      }

      md += isMal ? `\n#### 💳 പേയ്‌മെന്റ് വിഹിതം:\n` : `\n#### 💳 Payment Breakdown:\n`;
      md += `* **Cash:** ${formatMoney(pm.cash)} | **UPI:** ${formatMoney(pm.upi)} | **Card:** ${formatMoney(pm.card)} | **Credit:** ${formatMoney(pm.credit)}\n`;

      return {
        content: md,
        data: summary,
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ ക്യാഷ് സെയിൽസ് എത്രയാണ്?', 'ഈ മാസത്തെ സെയിൽസ് കാണിക്കൂ', 'കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ']
          : ["Show today's cash sales", "What is this month's total sales?", 'Top selling products today'],
        intent: parsed.intent,
      };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. Hourly Sales / Last Hour
    // ──────────────────────────────────────────────────────────────────────
    case 'SALES_HOURLY': {
      const todayRange = resolveDateRange('today', undefined, undefined, isMal);
      const invs = await fetchInvoices(todayRange.fromDate, todayRange.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const lastHourInvs = validInvs.filter((i: AiRow) => {
        const t = new Date(i.created_at as string).getTime();
        return t >= oneHourAgo.getTime() && t <= now.getTime();
      });

      const lastHourSales = lastHourInvs.reduce((acc: number, i: AiRow) => acc + (Number(i.grand_total) || 0), 0);

      const hourlyBuckets: Record<string, { hour: string; sales: number; count: number }> = {};
      for (let h = 8; h <= 22; h++) {
        const hStr = `${pad(h)}:00`;
        hourlyBuckets[hStr] = { hour: hStr, sales: 0, count: 0 };
      }

      validInvs.forEach((i: AiRow) => {
        const d = new Date(i.created_at as string);
        const h = d.getHours();
        const hStr = `${pad(h)}:00`;
        if (hourlyBuckets[hStr]) {
          hourlyBuckets[hStr].sales += Number(i.grand_total) || 0;
          hourlyBuckets[hStr].count += 1;
        }
      });

      const chartItems = Object.values(hourlyBuckets).filter(b => b.sales > 0 || (Number(b.hour.slice(0, 2)) >= 9 && Number(b.hour.slice(0, 2)) <= now.getHours()));

      const md = isMal
        ? `### ⏱️ മണിക്കൂർ തിരിച്ചുള്ള സെയിൽസ് (Hourly Sales)\n\n` +
          `* **കഴിഞ്ഞ 1 മണിക്കൂറിലെ വിൽപ്പന (Last 1 Hour):** **${formatMoney(lastHourSales)}** (${lastHourInvs.length} ബില്ലുകൾ)\n` +
          `* **ഇന്നത്തെ ആകെ വിൽപ്പന:** **${formatMoney(validInvs.reduce((acc: number, i: AiRow) => acc + (Number(i.grand_total) || 0), 0))}**\n\n`
        : `### ⏱️ Hourly Sales Intelligence\n\n` +
          `* **Sales During Last Hour:** **${formatMoney(lastHourSales)}** (${lastHourInvs.length} invoices)\n` +
          `* **Total Sales Today:** **${formatMoney(validInvs.reduce((acc: number, i: AiRow) => acc + (Number(i.grand_total) || 0), 0))}** (${validInvs.length} invoices)\n\n`;

      return {
        content: md,
        chartData: {
          type: 'bar',
          title: isMal ? 'മണിക്കൂർ തിരിച്ചുള്ള വിൽപ്പന' : 'Hourly Sales Trend',
          labelKey: 'hour',
          dataKey: 'sales',
          items: chartItems,
        },
        suggestedPrompts: isMal ? ['ഇന്നത്തെ ക്യാഷ് സെയിൽസ്', 'ഈ മാസത്തെ സെയിൽസ്'] : ["Today's cash sales", "This month's sales"],
        intent: parsed.intent,
      };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Historical Sales / Standard Reporting Periods
    // ──────────────────────────────────────────────────────────────────────
    case 'SALES_PERIOD':
    case 'SALES_CUSTOM_RANGE':
    case 'SALES_SPECIFIC_DATE': {
      const range = parsed.intent === 'SALES_CUSTOM_RANGE'
        ? resolveDateRange('custom', parsed.params.customFrom, parsed.params.customTo, isMal)
        : parsed.intent === 'SALES_SPECIFIC_DATE'
        ? resolveDateRange('custom', parsed.params.specificDate, parsed.params.specificDate, isMal)
        : resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);

      const summary = await fetchSummary(range.fromDate, range.toDate);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);
      const pm = calculatePaymentBreakdown(validInvs);
      const avgDaily = range.daysCount > 0 ? summary.totalSales / range.daysCount : summary.totalSales;

      let md = isMal
        ? `### 📈 സെയിൽസ് റിപ്പോർട്ട് — ${range.label}\n\n`
        : `### 📈 Sales Report — ${range.label}\n\n`;

      md += isMal
        ? `* **മൊത്തം വരുമാനം (Total Revenue):** **${formatMoney(summary.totalSales)}**\n` +
          `* **ആകെ ബില്ലുകൾ (Total Invoices):** **${summary.totalInvoices} എണ്ണം**\n` +
          `* **ശരാശരി ബിൽ തുക (Avg Ticket):** **${formatMoney(summary.avgOrder)}**\n` +
          (range.daysCount > 1 ? `* **പ്രതിദിന ശരാശരി (Avg Daily Sales):** **${formatMoney(avgDaily)}** (${range.daysCount} ദിവസങ്ങൾ)\n` : '')
        : `* **Total Sales Revenue:** **${formatMoney(summary.totalSales)}**\n` +
          `* **Total Invoices Count:** **${summary.totalInvoices} invoices**\n` +
          `* **Average Ticket Value:** **${formatMoney(summary.avgOrder)}**\n` +
          (range.daysCount > 1 ? `* **Average Daily Sales:** **${formatMoney(avgDaily)}** (over ${range.daysCount} days)\n` : '');

      if (summary.totalTax > 0) {
        md += isMal ? `* **ടാക്സ് (GST):** ${formatMoney(summary.totalTax)}\n` : `* **Tax (GST) Collected:** ${formatMoney(summary.totalTax)}\n`;
      }
      if (summary.totalDiscount > 0) {
        md += isMal ? `* **ഡിസ്കൗണ്ട്:** ${formatMoney(summary.totalDiscount)}\n` : `* **Discounts Given:** ${formatMoney(summary.totalDiscount)}\n`;
      }

      if (validInvs.length > 0) {
        md += isMal
          ? `\n#### 💳 പേയ്‌മെന്റ് രീതി തിരിച്ചുള്ള തുക:\n` +
            `| രീതി | തുക |\n| :--- | :---: |\n` +
            `| 💵 ക്യാഷ് (Cash) | **${formatMoney(pm.cash)}** |\n` +
            `| 📱 UPI | **${formatMoney(pm.upi)}** |\n` +
            `| 💳 കാർഡ് (Card) | **${formatMoney(pm.card)}** |\n` +
            `| 📒 ക്രെഡിറ്റ് (Credit) | **${formatMoney(pm.credit)}** |\n`
          : `\n#### 💳 Sales by Payment Method:\n` +
            `| Payment Method | Total Amount |\n| :--- | :---: |\n` +
            `| 💵 Cash | **${formatMoney(pm.cash)}** |\n` +
            `| 📱 UPI | **${formatMoney(pm.upi)}** |\n` +
            `| 💳 Card | **${formatMoney(pm.card)}** |\n` +
            `| 📒 Credit | **${formatMoney(pm.credit)}** |\n`;
      }

      return {
        content: md,
        data: summary,
        suggestedPrompts: isMal
          ? ['കഴിഞ്ഞ കാലയളവുമായി താരതമ്യം ചെയ്യൂ', 'കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ', 'ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?']
          : ['Compare with previous period', 'Top selling products', "What is today's sales?"],
        intent: parsed.intent,
      };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. Period Comparison
    // ──────────────────────────────────────────────────────────────────────
    case 'COMPARE_SALES': {
      const compareWith = parsed.params.compareWith || 'last_month';
      let curRange: OfflineDateRange;
      let prevRange: OfflineDateRange;

      if (compareWith === 'yesterday') {
        curRange = resolveDateRange('today', undefined, undefined, isMal);
        prevRange = resolveDateRange('yesterday', undefined, undefined, isMal);
      } else if (compareWith === 'last_week') {
        curRange = resolveDateRange('this_week', undefined, undefined, isMal);
        prevRange = resolveDateRange('last_week', undefined, undefined, isMal);
      } else if (compareWith === 'last_year') {
        curRange = resolveDateRange('this_year', undefined, undefined, isMal);
        prevRange = resolveDateRange('last_year', undefined, undefined, isMal);
      } else {
        curRange = resolveDateRange('this_month', undefined, undefined, isMal);
        prevRange = resolveDateRange('last_month', undefined, undefined, isMal);
      }

      const [curSummary, prevSummary] = await Promise.all([
        fetchSummary(curRange.fromDate, curRange.toDate),
        fetchSummary(prevRange.fromDate, prevRange.toDate),
      ]);

      const diffSales = curSummary.totalSales - prevSummary.totalSales;
      const pctSales = prevSummary.totalSales > 0 ? (diffSales / prevSummary.totalSales) * 100 : 0;
      const diffInvs = curSummary.totalInvoices - prevSummary.totalInvoices;

      const growthLabel = diffSales >= 0
        ? (isMal ? 'വളർച്ച (+ 📈)' : 'Growth (+ 📈)')
        : (isMal ? 'കുറവ് (- 📉)' : 'Decline (- 📉)');

      const md = isMal
        ? `### ⚖️ വിൽപ്പന താരതമ്യ റിപ്പോർട്ട് (Sales Comparison)\n` +
          `**${curRange.label}**-ഉം **${prevRange.label}**-ഉം തമ്മിലുള്ള വിശകലനം:\n\n` +
          `| സൂചിക | ${curRange.label} | ${prevRange.label} | വ്യത്യാസം |\n` +
          `| :--- | :---: | :---: | :---: |\n` +
          `| **ആകെ വിൽപ്പന** | **${formatMoney(curSummary.totalSales)}** | **${formatMoney(prevSummary.totalSales)}** | **${diffSales >= 0 ? '+' : ''}${formatMoney(diffSales)} (${growthLabel})** |\n` +
          `| **ബില്ലുകളുടെ എണ്ണം** | ${curSummary.totalInvoices} ബില്ലുകൾ | ${prevSummary.totalInvoices} ബില്ലുകൾ | ${diffInvs >= 0 ? '+' : ''}${diffInvs} |\n` +
          `| **ശരാശരി ബിൽ തുക** | ${formatMoney(curSummary.avgOrder)} | ${formatMoney(prevSummary.avgOrder)} | — |\n\n` +
          `💡 **സംഗ്രഹം:** ${prevRange.label}-നേക്കാൾ വിൽപ്പന വരുമാനത്തിൽ **${Math.abs(Math.round(pctSales))}%${diffSales >= 0 ? ' വർദ്ധനവ്' : ' കുറവ്'}** രേഖപ്പെടുത്തി.\n`
        : `### ⚖️ Sales Comparison Report\n` +
          `Comparative analysis between **${curRange.label}** and **${prevRange.label}**:\n\n` +
          `| Metric | ${curRange.label} | ${prevRange.label} | Variance |\n` +
          `| :--- | :---: | :---: | :---: |\n` +
          `| **Total Sales** | **${formatMoney(curSummary.totalSales)}** | **${formatMoney(prevSummary.totalSales)}** | **${diffSales >= 0 ? '+' : ''}${formatMoney(diffSales)} (${growthLabel})** |\n` +
          `| **Invoices Count** | ${curSummary.totalInvoices} invoices | ${prevSummary.totalInvoices} invoices | ${diffInvs >= 0 ? '+' : ''}${diffInvs} |\n` +
          `| **Average Ticket** | ${formatMoney(curSummary.avgOrder)} | ${formatMoney(prevSummary.avgOrder)} | — |\n\n` +
          `💡 **Summary:** Sales revenue shows a **${Math.abs(Math.round(pctSales))}% ${growthLabel}** compared to ${prevRange.label}.\n`;

      return {
        content: md,
        suggestedPrompts: isMal ? ['കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ', 'ഇന്നത്തെ സെയിൽസ്'] : ['Top selling products', "What is today's sales?"],
        intent: parsed.intent,
      };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. Invoices Count & Average Metrics
    // ──────────────────────────────────────────────────────────────────────
    case 'SALES_INVOICE_COUNT': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);

      const md = isMal
        ? `### 🧾 ബില്ലുകളുടെ എണ്ണം — ${range.label}\n\n` +
          `* **ആകെ അടിച്ച ബില്ലുകൾ (Total Invoices):** **${summary.totalInvoices} ബില്ലുകൾ**\n` +
          `* **ആകെ വിൽപ്പന തുക:** **${formatMoney(summary.totalSales)}**\n` +
          `* **ശരാശരി ബിൽ തുക:** **${formatMoney(summary.avgOrder)}**\n`
        : `### 🧾 Invoice Count — ${range.label}\n\n` +
          `* **Total Invoices Generated:** **${summary.totalInvoices} bills**\n` +
          `* **Total Revenue:** **${formatMoney(summary.totalSales)}**\n` +
          `* **Average Ticket Value:** **${formatMoney(summary.avgOrder)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_AVERAGE_TICKET': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);

      const md = isMal
        ? `### 🎟️ ശരാശരി ബിൽ തുക (Average Ticket Value)\n\n` +
          `* **കാലയളവ്:** ${range.label}\n` +
          `* **ശരാശരി ബിൽ തുക (Average Ticket):** **${formatMoney(summary.avgOrder)}**\n` +
          `* **ആകെ വിൽപ്പന:** ${formatMoney(summary.totalSales)}\n` +
          `* **ആകെ ബില്ലുകൾ:** ${summary.totalInvoices} എണ്ണം\n`
        : `### 🎟️ Average Ticket Value (Average Order Value)\n\n` +
          `* **Period:** ${range.label}\n` +
          `* **Average Ticket Value:** **${formatMoney(summary.avgOrder)}**\n` +
          `* **Total Revenue:** ${formatMoney(summary.totalSales)}\n` +
          `* **Total Bills:** ${summary.totalInvoices} invoices\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_AVERAGE_DAILY': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);
      const days = Math.max(1, range.daysCount);
      const avgDailySales = summary.totalSales / days;
      const avgDailyBills = Math.round((summary.totalInvoices / days) * 10) / 10;

      const md = isMal
        ? `### 📅 പ്രതിദിന ശരാശരി വിൽപ്പന — ${range.label}\n\n` +
          `* **പ്രതിദിന ശരാശരി വരുമാനം:** **${formatMoney(avgDailySales)}**\n` +
          `* **പ്രതിദിന ശരാശരി ബില്ലുകൾ:** **${avgDailyBills} ബില്ലുകൾ/ദിവസം**\n` +
          `* **ആകെ വിൽപ്പന തുക:** ${formatMoney(summary.totalSales)} (${days} ദിവസങ്ങളിൽ നിന്ന്)\n`
        : `### 📅 Average Daily Sales — ${range.label}\n\n` +
          `* **Average Daily Sales Revenue:** **${formatMoney(avgDailySales)}**\n` +
          `* **Average Invoices per Day:** **${avgDailyBills} bills/day**\n` +
          `* **Period Total Sales:** ${formatMoney(summary.totalSales)} over ${days} calendar days\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_UNIQUE_CUSTOMERS': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const customerSet = new Set<string>();
      let walkinCount = 0;

      validInvs.forEach((i: AiRow) => {
        const ident = i.customer_phone || (i.customer_name && i.customer_name !== 'Walk-in Customer' ? i.customer_name : null);
        if (ident) customerSet.add(ident.trim().toLowerCase());
        else walkinCount++;
      });

      const totalUnique = customerSet.size;

      const md = isMal
        ? `### 👥 ഉപഭോക്താക്കളുടെ എണ്ണം — ${range.label}\n\n` +
          `* **വ്യത്യസ്ത കസ്റ്റമർമാർ (Unique Customers):** **${totalUnique} പേർ**\n` +
          `* **വാക്ക്-ഇൻ ബില്ലുകൾ:** ${walkinCount} എണ്ണം\n` +
          `* **ആകെ ബില്ലുകൾ:** ${validInvs.length} എണ്ണം\n`
        : `### 👥 Unique Customers Count — ${range.label}\n\n` +
          `* **Unique Identified Customers:** **${totalUnique} customers**\n` +
          `* **Walk-in Anonymous Transactions:** ${walkinCount} bills\n` +
          `* **Total Invoices Generated:** ${validInvs.length} invoices\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_INVOICE_EXTREMES': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      if (parsed.params.minAmount) {
        const threshold = parsed.params.minAmount;
        const filtered = validInvs.filter((i: AiRow) => Number(i.grand_total) >= threshold);
        const md = isMal
          ? `### 🧾 ${getCurrencyPrefix()}${threshold.toLocaleString()}-ൽ കൂടുതൽ തുകയുള്ള ബില്ലുകൾ (${range.label})\n\n` +
            `* **ആകെ എണ്ണം:** **${filtered.length} ബില്ലുകൾ**\n`
          : `### 🧾 Invoices Greater Than ${getCurrencyPrefix()}${threshold.toLocaleString()} (${range.label})\n\n` +
            `* **Total Matching Invoices:** **${filtered.length} bills**\n`;

        return { content: md, intent: parsed.intent };
      }

      if (validInvs.length === 0) {
        return { content: isMal ? 'ഈ കാലയളവിൽ ബില്ലുകൾ ഒന്നും ലഭ്യമല്ല.' : `No invoices found for ${range.label}.` };
      }

      const sorted = [...validInvs].sort((a, b) => (Number(b.grand_total) || 0) - (Number(a.grand_total) || 0));
      const highest = sorted[0];
      const lowest = sorted[sorted.length - 1];

      let md: string;
      if (parsed.params.isLowest) {
        md = isMal
          ? `### 🧾 ഏറ്റവും കുറഞ്ഞ ബിൽ തുക (${range.label})\n\n` +
            `* **ബിൽ നമ്പർ:** **${lowest.invoice_number || 'N/A'}**\n` +
            `* **തുക:** **${formatMoney(lowest.grand_total)}**\n` +
            `* **കസ്റ്റമർ:** ${lowest.customer_name || 'Walk-in Customer'}\n`
          : `### 🧾 Lowest-Value Invoice (${range.label})\n\n` +
            `* **Invoice Number:** **${lowest.invoice_number || 'N/A'}**\n` +
            `* **Invoice Amount:** **${formatMoney(lowest.grand_total)}**\n` +
            `* **Customer:** ${lowest.customer_name || 'Walk-in Customer'}\n`;
      } else {
        md = isMal
          ? `### 🧾 ഏറ്റവും കൂടിയ ബിൽ തുക (${range.label})\n\n` +
            `* **ബിൽ നമ്പർ:** **${highest.invoice_number || 'N/A'}**\n` +
            `* **തുക:** **${formatMoney(highest.grand_total)}**\n` +
            `* **കസ്റ്റമർ:** ${highest.customer_name || 'Walk-in Customer'}\n`
          : `### 🧾 Highest-Value Invoice (${range.label})\n\n` +
            `* **Invoice Number:** **${highest.invoice_number || 'N/A'}**\n` +
            `* **Invoice Amount:** **${formatMoney(highest.grand_total)}**\n` +
            `* **Customer:** ${highest.customer_name || 'Walk-in Customer'}\n`;
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_PAYMENT_METHODS': {
      const range = resolveDateRange(
        parsed.params.customFrom && parsed.params.customTo ? 'custom' : (parsed.params.rangeType || 'today'),
        parsed.params.customFrom,
        parsed.params.customTo,
        isMal
      );
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);
      const pm = calculatePaymentBreakdown(validInvs);
      const totalSales = pm.totalSales;
      const requestedMethod = parsed.params.method || 'ALL';

      let md: string;
      if (requestedMethod === 'CASH') {
        const cashPct = totalSales > 0 ? ((pm.cash / totalSales) * 100).toFixed(1) : '0';
        md = isMal
          ? `### 💵 ക്യാഷ് സെയിൽസ് (Cash Sales) — ${range.label}\n\n` +
            `* **ആകെ ലഭിച്ച ക്യാഷ്:** **${formatMoney(pm.cash)}** (${cashPct}% of total)\n` +
            `* **ആകെ സെയിൽസ്:** ${formatMoney(totalSales)}\n`
          : `### 💵 Cash Sales — ${range.label}\n\n` +
            `* **Total Cash Collected:** **${formatMoney(pm.cash)}** (${cashPct}% of total)\n` +
            `* **Total Sales Revenue:** ${formatMoney(totalSales)}\n`;
      } else if (requestedMethod === 'CREDIT') {
        const creditPct = totalSales > 0 ? ((pm.credit / totalSales) * 100).toFixed(1) : '0';
        md = isMal
          ? `### 📒 ക്രെഡിറ്റ് സെയിൽസ് (Credit Sales) — ${range.label}\n\n` +
            `* **ആകെ ക്രെഡിറ്റ് വിൽപ്പന:** **${formatMoney(pm.credit)}** (${creditPct}% of total)\n` +
            `* **ആകെ സെയിൽസ്:** ${formatMoney(totalSales)}\n`
          : `### 📒 Credit Sales — ${range.label}\n\n` +
            `* **Total Credit Sales:** **${formatMoney(pm.credit)}** (${creditPct}% of total)\n` +
            `* **Total Sales Revenue:** ${formatMoney(totalSales)}\n`;
      } else if (requestedMethod === 'UPI') {
        md = isMal
          ? `### 📱 UPI സെയിൽസ് — ${range.label}\n\n* **UPI വഴി ലഭിച്ച തുക:** **${formatMoney(pm.upi)}**\n`
          : `### 📱 UPI Sales — ${range.label}\n\n* **Total Paid via UPI:** **${formatMoney(pm.upi)}**\n`;
      } else if (requestedMethod === 'CARD') {
        md = isMal
          ? `### 💳 കാർഡ് സെയിൽസ് — ${range.label}\n\n* **കാർഡ് വഴി ലഭിച്ച തുക:** **${formatMoney(pm.card)}**\n`
          : `### 💳 Card Sales — ${range.label}\n\n* **Total Paid via Card:** **${formatMoney(pm.card)}**\n`;
      } else {
        md = isMal
          ? `### 💳 പേയ്‌മെന്റ് രീതി തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
            `ആകെ വിൽപ്പന വരുമാനം: **${formatMoney(totalSales)}**\n\n` +
            `| പേയ്‌മെന്റ് രീതി | തുക | വിഹിതം |\n| :--- | :---: | :---: |\n` +
            `| 💵 ക്യാഷ് (Cash) | **${formatMoney(pm.cash)}** | ${totalSales > 0 ? Math.round((pm.cash / totalSales) * 100) : 0}% |\n` +
            `| 📱 UPI | **${formatMoney(pm.upi)}** | ${totalSales > 0 ? Math.round((pm.upi / totalSales) * 100) : 0}% |\n` +
            `| 💳 കാർഡ് (Card) | **${formatMoney(pm.card)}** | ${totalSales > 0 ? Math.round((pm.card / totalSales) * 100) : 0}% |\n` +
            `| 📒 ക്രെഡിറ്റ് (Credit) | **${formatMoney(pm.credit)}** | ${totalSales > 0 ? Math.round((pm.credit / totalSales) * 100) : 0}% |\n` +
            `| 🏦 ബാങ്ക് / ചെക്ക് | **${formatMoney(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round(((pm.bank + pm.cheque) / totalSales) * 100) : 0}% |\n`
          : `### 💳 Sales by Payment Method — ${range.label}\n\n` +
            `Total Sales Revenue: **${formatMoney(totalSales)}**\n\n` +
            `| Payment Method | Amount | Share |\n| :--- | :---: | :---: |\n` +
            `| 💵 Cash | **${formatMoney(pm.cash)}** | ${totalSales > 0 ? Math.round((pm.cash / totalSales) * 100) : 0}% |\n` +
            `| 📱 UPI | **${formatMoney(pm.upi)}** | ${totalSales > 0 ? Math.round((pm.upi / totalSales) * 100) : 0}% |\n` +
            `| 💳 Card | **${formatMoney(pm.card)}** | ${totalSales > 0 ? Math.round((pm.card / totalSales) * 100) : 0}% |\n` +
            `| 📒 Credit | **${formatMoney(pm.credit)}** | ${totalSales > 0 ? Math.round((pm.credit / totalSales) * 100) : 0}% |\n` +
            `| 🏦 Bank / Cheque | **${formatMoney(pm.bank + pm.cheque)}** | ${totalSales > 0 ? Math.round(((pm.bank + pm.cheque) / totalSales) * 100) : 0}% |\n`;
      }

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_CREDIT_OUTSTANDING': {
      const invs = await fetchInvoices('2000-01-01', '2099-12-31');
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);
      const pm = calculatePaymentBreakdown(validInvs);

      const md = isMal
        ? `### 📒 ഇൻവോയ്സ് ക്രെഡിറ്റ് കുടിശ്ശിക\n\n` +
          `* **ആകെ ലഭിക്കാനുള്ള ക്രെഡിറ്റ് തുക:** **${formatMoney(pm.credit)}**\n`
        : `### 📒 Outstanding Credit from Invoices\n\n` +
          `* **Total Outstanding Credit Amount:** **${formatMoney(pm.credit)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_GROSS_NET': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', undefined, undefined, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);
      const gross = summary.totalSales + summary.totalDiscount;

      const md = isMal
        ? `### 📊 ഗ്രോസ് vs നെറ്റ് സെയിൽസ് — ${range.label}\n\n` +
          `* **ഗ്രോസ് സെയിൽസ് (ഡിസ്കൗണ്ടിന് മുൻപ്):** **${formatMoney(gross)}**\n` +
          `* **നൽകിയ ആകെ ഡിസ്കൗണ്ട്:** **${formatMoney(summary.totalDiscount)}**\n` +
          `* **നെറ്റ് സെയിൽസ് (യഥാർത്ഥ ഇൻവോയ്സ് തുക):** **${formatMoney(summary.totalSales)}**\n` +
          `* **പിരിച്ചെടുത്ത ജിഎസ്ടി (Tax):** **${formatMoney(summary.totalTax)}**\n` +
          `* **ബില്ലുകളുടെ എണ്ണം:** ${summary.totalInvoices} എണ്ണം\n`
        : `### 📊 Gross vs Net Sales & Deductions — ${range.label}\n\n` +
          `* **Gross Sales (Before Discounts):** **${formatMoney(gross)}**\n` +
          `* **Total Discounts Given:** **${formatMoney(summary.totalDiscount)}**\n` +
          `* **Net Sales Revenue (Final Invoiced):** **${formatMoney(summary.totalSales)}**\n` +
          `* **Total Tax (GST) Collected:** **${formatMoney(summary.totalTax)}**\n` +
          `* **Invoices Count:** ${summary.totalInvoices} bills\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SALES_INVOICE_TYPES': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id);

      const typeMap: Record<string, { count: number; total: number }> = {};
      validInvs.forEach((i: AiRow) => {
        const t = i.invoice_type || 'STANDARD';
        if (!typeMap[t]) typeMap[t] = { count: 0, total: 0 };
        typeMap[t].count += 1;
        typeMap[t].total += Number(i.grand_total) || 0;
      });

      let md = isMal
        ? `### 📑 ബിൽ തരം തിരിച്ചുള്ള വിൽപ്പന — ${range.label}\n\n` +
          `| ബിൽ തരം | എണ്ണം | ആകെ തുക |\n| :--- | :---: | :---: |\n`
        : `### 📑 Sales by Invoice Type — ${range.label}\n\n` +
          `| Invoice Type | Count | Total Amount |\n| :--- | :---: | :---: |\n`;

      Object.keys(typeMap).forEach(k => {
        md += `| **${k}** | ${typeMap[k].count} | **${formatMoney(typeMap[k].total)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'DAILY_BUSINESS_REPORT': {
      const range = resolveDateRange(parsed.params.rangeType || 'today', parsed.params.customFrom, parsed.params.customTo, isMal);
      const summary = await fetchSummary(range.fromDate, range.toDate);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const pm = calculatePaymentBreakdown(invs);

      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const expenseTxs = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');
      const totalExpense = expenseTxs.reduce((acc: number, t: AiRow) => acc + (Number(t.amount) || 0), 0);

      const purchases = await fetchPurchaseBills();
      const rangePurchases = purchases.filter((p: AiRow) => {
        const d = (p.bill_date || p.created_at || '').substring(0, 10);
        return d >= range.fromDate && d <= range.toDate;
      });
      const totalPurchases = rangePurchases.reduce((acc: number, p: AiRow) => acc + (Number(p.grand_total || p.total_amount) || 0), 0);

      const returns = await fetchReturns();
      const rangeReturns = returns.filter((r: AiRow) => {
        const d = (r.return_date || r.created_at || '').substring(0, 10);
        return d >= range.fromDate && d <= range.toDate;
      });
      const totalReturns = rangeReturns.reduce((acc: number, r: AiRow) => acc + (Number(r.grand_total || r.total) || 0), 0);

      const netRevenue = Math.max(0, summary.totalSales - totalReturns);
      const netCashFlow = netRevenue - totalExpense;

      const md = isMal
        ? `### 📑 സമഗ്ര ദിന ബിസിനസ്സ് റിപ്പോർട്ട് (${range.label})\n\n` +
          `| പ്രധാന സൂചികകൾ | എണ്ണം | ആകെ തുക |\n` +
          `| :--- | :--- | :--- |\n` +
          `| 📊 **ആകെ വിൽപ്പന (Sales)** | ${summary.totalInvoices} ബില്ലുകൾ | **${formatMoney(summary.totalSales)}** |\n` +
          `| 🔄 **സെയിൽസ് റിട്ടേണുകൾ (Returns)** | ${rangeReturns.length} എണ്ണം | **${formatMoney(totalReturns)}** |\n` +
          `| 📦 **പർച്ചേസ് ബില്ലുകൾ (Purchases)** | ${rangePurchases.length} എണ്ണം | **${formatMoney(totalPurchases)}** |\n` +
          `| 💸 **പ്രവർത്തന ചെലവുകൾ (Expenses)** | ${expenseTxs.length} എണ്ണം | **${formatMoney(totalExpense)}** |\n` +
          `| 📈 **അറ്റ വിൽപ്പന വരുമാനം (Net Revenue)** | — | **${formatMoney(netRevenue)}** |\n` +
          `| 💵 **പ്രതിദിന അറ്റ ക്യാഷ് ഫ്ലോ (Net Flow)** | — | **${formatMoney(netCashFlow)}** |\n\n` +
          `#### 💳 പേയ്‌മെന്റ് വിഹിതം:\n` +
          `* **ക്യാഷ്:** ${formatMoney(pm.cash)} | **യുപിഐ:** ${formatMoney(pm.upi)} | **കാർഡ്:** ${formatMoney(pm.card)} | **ക്രെഡിറ്റ്:** ${formatMoney(pm.credit)}\n`
        : `### 📑 Comprehensive Daily Business Report (${range.label})\n\n` +
          `| Core Metric | Count | Total Amount |\n` +
          `| :--- | :--- | :--- |\n` +
          `| 📊 **Total Sales Revenue** | ${summary.totalInvoices} invoices | **${formatMoney(summary.totalSales)}** |\n` +
          `| 🔄 **Sales Returns & Refunds** | ${rangeReturns.length} returns | **${formatMoney(totalReturns)}** |\n` +
          `| 📦 **Purchases Incurred** | ${rangePurchases.length} bills | **${formatMoney(totalPurchases)}** |\n` +
          `| 💸 **Operating Expenses** | ${expenseTxs.length} records | **${formatMoney(totalExpense)}** |\n` +
          `| 📈 **Net Sales Revenue** | — | **${formatMoney(netRevenue)}** |\n` +
          `| 💵 **Estimated Net Daily Cashflow** | — | **${formatMoney(netCashFlow)}** |\n\n` +
          `#### 💳 Payment Breakdown:\n` +
          `* **Cash:** ${formatMoney(pm.cash)} | **UPI:** ${formatMoney(pm.upi)} | **Card:** ${formatMoney(pm.card)} | **Credit:** ${formatMoney(pm.credit)}\n`;

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
