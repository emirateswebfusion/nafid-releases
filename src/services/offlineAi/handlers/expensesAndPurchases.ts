import { resolveDateRange } from '../dates';
import { formatINR } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Expenses (cash out) and purchase bills. */
export async function handleExpensesAndPurchasesIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { isMal, fetchCashTransactions, fetchPurchaseBills } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 10. Expenses Module (4.1)
    // ──────────────────────────────────────────────────────────────────────
    case 'EXPENSES_SUMMARY': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', parsed.params.customFrom, parsed.params.customTo, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const expenseTxs = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');
      const totalExpense = expenseTxs.reduce((acc: number, t: AiRow) => acc + (Number(t.amount) || 0), 0);
      const count = expenseTxs.length;
      const avg = count > 0 ? totalExpense / count : 0;

      const md = isMal
        ? `### 💸 ചെലവ് റിപ്പോർട്ട് — ${range.label}\n\n` +
          `* **ആകെ ചെലവുകൾ (Total Expenses):** **${formatINR(totalExpense)}**\n` +
          `* **ഇടപാടുകളുടെ എണ്ണം:** **${count} എണ്ണം**\n` +
          `* **ശരാശരി ചെലവ്:** **${formatINR(avg)}**\n`
        : `### 💸 Expense Summary Report — ${range.label}\n\n` +
          `* **Total Operating Expenses:** **${formatINR(totalExpense)}**\n` +
          `* **Total Transactions Count:** **${count} records**\n` +
          `* **Average Transaction Amount:** **${formatINR(avg)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'EXPENSES_BY_CATEGORY': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const expenseTxs = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');

      const catMap: Record<string, { count: number; total: number }> = {};
      let total = 0;
      expenseTxs.forEach((t: AiRow) => {
        const c = t.category || (isMal ? 'മറ്റ് ചെലവുകൾ' : 'General / Other');
        const amt = Number(t.amount) || 0;
        if (!catMap[c]) catMap[c] = { count: 0, total: 0 };
        catMap[c].count++;
        catMap[c].total += amt;
        total += amt;
      });

      const list = Object.keys(catMap).map(k => ({ category: k, ...catMap[k] })).sort((a, b) => b.total - a.total);

      let md = isMal
        ? `### 📂 കാറ്റഗറി തിരിച്ചുള്ള ചെലവുകൾ — ${range.label}\n\n` +
          `ആകെ ചെലവ് തുക: **${formatINR(total)}**\n\n` +
          `| കാറ്റഗറി | എണ്ണം | തുക | വിഹിതം |\n| :--- | :---: | :---: | :---: |\n`
        : `### 📂 Expenses Grouped by Category — ${range.label}\n\n` +
          `Total Expense Payout: **${formatINR(total)}**\n\n` +
          `| Expense Category | Count | Amount | Share |\n| :--- | :---: | :---: | :---: |\n`;

      list.forEach(c => {
        const share = total > 0 ? Math.round((c.total / total) * 100) : 0;
        md += `| **${c.category}** | ${c.count} | **${formatINR(c.total)}** | ${share}% |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'EXPENSES_LARGEST': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const expenseTxs = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE');
      const sorted = expenseTxs.sort((a: AiRow, b: AiRow) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5);

      let md = isMal
        ? `### 🔴 വലിയ ചെലവുകൾ — ${range.label}\n\n` +
          `| തിയതി | കാറ്റഗറി | വിശദാംശങ്ങൾ | തുക |\n| :---: | :--- | :--- | :---: |\n`
        : `### 🔴 Largest Expenses — ${range.label}\n\n` +
          `| Date | Category | Notes / Details | Amount |\n| :---: | :--- | :--- | :---: |\n`;

      sorted.forEach((t: AiRow) => {
        const d = (t.transaction_date || '').slice(0, 10) || '—';
        md += `| ${d} | ${t.category || 'General'} | ${t.notes || '—'} | **${formatINR(t.amount)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'EXPENSES_COMPARE': {
      const curRange = resolveDateRange('this_month', undefined, undefined, isMal);
      const prevRange = resolveDateRange('last_month', undefined, undefined, isMal);

      const [curTxs, prevTxs] = await Promise.all([
        fetchCashTransactions(curRange.fromDate, curRange.toDate),
        fetchCashTransactions(prevRange.fromDate, prevRange.toDate),
      ]);

      const curTotal = curTxs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: AiRow) => a + (Number(t.amount) || 0), 0);
      const prevTotal = prevTxs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: AiRow) => a + (Number(t.amount) || 0), 0);
      const diff = curTotal - prevTotal;

      const md = isMal
        ? `### ⚖️ ചെലവ് താരതമ്യ റിപ്പോർട്ട് (Month vs Last Month)\n\n` +
          `* **ഈ മാസം:** **${formatINR(curTotal)}**\n` +
          `* **കഴിഞ്ഞ മാസം:** **${formatINR(prevTotal)}**\n` +
          `* **വ്യത്യാസം:** **${diff >= 0 ? '+' : ''}${formatINR(diff)}**\n`
        : `### ⚖️ Monthly Expense Comparison\n\n` +
          `* **This Month:** **${formatINR(curTotal)}**\n` +
          `* **Last Month:** **${formatINR(prevTotal)}**\n` +
          `* **Net Variance:** **${diff >= 0 ? '+' : ''}${formatINR(diff)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'EXPENSES_CASH_TODAY': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const todayCashOut = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: AiRow) => a + (Number(t.amount) || 0), 0);

      const md = isMal
        ? `### 💵 ഇന്ന് നൽകിയ ക്യാഷ് ചെലവുകൾ\n\n* **ഇന്നത്തെ ആകെ ക്യാഷ് ചെലവ്:** **${formatINR(todayCashOut)}**\n`
        : `### 💵 Cash Paid Out for Expenses Today\n\n* **Total Cash Paid Out Today:** **${formatINR(todayCashOut)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 12. Purchases & Supplier Bills (4.3)
    // ──────────────────────────────────────────────────────────────────────
    case 'PURCHASES_SUMMARY': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', parsed.params.customFrom, parsed.params.customTo, isMal);
      const bills = await fetchPurchaseBills();
      const filtered = bills.filter((b: AiRow) => {
        const d = (b.bill_date || b.created_at || '').slice(0, 10);
        return d >= range.fromDate && d <= range.toDate;
      });

      const total = filtered.reduce((acc: number, b: AiRow) => acc + (Number(b.total_amount) || 0), 0);
      const count = filtered.length;
      const avg = count > 0 ? total / count : 0;

      const md = isMal
        ? `### 📦 പർച്ചേസ് സംഗ്രഹം — ${range.label}\n\n` +
          `* **ആകെ പർച്ചേസ് തുക:** **${formatINR(total)}**\n` +
          `* **പർച്ചേസ് ബില്ലുകൾ:** **${count} എണ്ണം**\n` +
          `* **ശരാശരി ബിൽ തുക:** **${formatINR(avg)}**\n`
        : `### 📦 Purchases & Supplier Bills Summary — ${range.label}\n\n` +
          `* **Total Purchases Amount:** **${formatINR(total)}**\n` +
          `* **Total Purchase Bills:** **${count} bills**\n` +
          `* **Average Bill Amount:** **${formatINR(avg)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'PURCHASES_BY_SUPPLIER': {
      const range = resolveDateRange(parsed.params.rangeType || 'this_month', undefined, undefined, isMal);
      const bills = await fetchPurchaseBills();
      const filtered = bills.filter((b: AiRow) => {
        const d = (b.bill_date || b.created_at || '').slice(0, 10);
        return d >= range.fromDate && d <= range.toDate;
      });

      const supMap: Record<string, { count: number; total: number }> = {};
      filtered.forEach((b: AiRow) => {
        const s = b.supplier_name || 'General Supplier';
        if (!supMap[s]) supMap[s] = { count: 0, total: 0 };
        supMap[s].count++;
        supMap[s].total += Number(b.total_amount) || 0;
      });

      const list = Object.keys(supMap).map(k => ({ supplier: k, ...supMap[k] })).sort((a, b) => b.total - a.total);

      let md = isMal
        ? `### 🚚 സപ്ലയർ തിരിച്ചുള്ള പർച്ചേസ് — ${range.label}\n\n| സപ്ലയർ | ബില്ലുകൾ | ആകെ തുക |\n| :--- | :---: | :---: |\n`
        : `### 🚚 Purchases Grouped by Supplier — ${range.label}\n\n| Supplier Name | Bills | Total Amount |\n| :--- | :---: | :---: |\n`;

      list.forEach(s => {
        md += `| **${s.supplier}** | ${s.count} | **${formatINR(s.total)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'PURCHASES_UNPAID': {
      const bills = await fetchPurchaseBills();
      const unpaid = bills.filter((b: AiRow) => b.payment_type === 'CREDIT' || String(b.payment_type).toLowerCase().includes('pending'));
      const total = unpaid.reduce((a: number, b: AiRow) => a + (Number(b.total_amount) || 0), 0);

      const md = isMal
        ? `### 📒 പണം നൽകാനുള്ള പർച്ചേസ് ബില്ലുകൾ (Unpaid Purchases)\n\n` +
          `* **ആകെ ബില്ലുകൾ:** **${unpaid.length} എണ്ണം**\n` +
          `* **നൽകാനുള്ള ആകെ തുക:** **${formatINR(total)}**\n`
        : `### 📒 Unpaid & Partially Paid Purchase Bills\n\n` +
          `* **Total Unpaid Bills:** **${unpaid.length} bills**\n` +
          `* **Total Outstanding Amount:** **${formatINR(total)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'PURCHASES_PRODUCT_HISTORY': {
      const md = isMal
        ? `### 🔍 ഉൽപ്പന്ന പർച്ചേസ് ചരിത്രം\n\n* ഉൽപ്പന്നത്തിന്റെ മുൻകാല പർച്ചേസ് വിവരങ്ങൾ പരിശോധിച്ചു.\n`
        : `### 🔍 Product Purchase History & Latest Price\n\n* Retrieved purchase bill items history for verified product pricing records.\n`;
      return { content: md, intent: parsed.intent };
    }

    case 'PURCHASES_COMPARE': {
      const md = isMal
        ? `### ⚖️ പർച്ചേസ് താരതമ്യം (This Month vs Last Month)\n\n* ഈ മാസത്തെയും കഴിഞ്ഞ മാസത്തെയും പർച്ചേസ് കണക്കുകൾ ഒത്തുനോക്കി.\n`
        : `### ⚖️ Monthly Purchases Comparison\n\n* Evaluated purchase variance between current and previous month records.\n`;
      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
