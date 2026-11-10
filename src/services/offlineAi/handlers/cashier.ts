import { getStoreBusinessDate } from '../../../utils/time/timezoneHelper';
import { cashierApi } from '../../../data/cashier';
import { hasBridge } from '../../../data/client';
import { resolveDateRange } from '../dates';
import { calculatePaymentBreakdown, formatMoney } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Cash drawer, settlements and unpaid / partially paid bills. */
export async function handleCashierIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { tenantId, isMal, fetchInvoices, fetchCashTransactions, fetchCashDrawer } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 14. Cash Register & Cash Drawer (4.5)
    // ──────────────────────────────────────────────────────────────────────
    case 'CASH_DRAWER_CURRENT': {
      const drawer = await fetchCashDrawer();
      if (!drawer) return { content: isMal ? 'ഈ തീയതിയിൽ ക്യാഷ് ഡ്രോയർ രേഖയില്ല. നിലവിലെ പണം സ്ഥിരീകരിക്കാൻ കഴിയില്ല.' : 'No cash drawer record exists for this date. Current cash cannot be confirmed.', intent: parsed.intent };

      const md = isMal
        ? `### 💵 ക്യാഷ് ഡ്രോയർ നില (Cash Drawer Status)\n\n` +
          `* **ഡ്രോയർ സ്റ്റാറ്റസ്:** **${drawer.status || 'OPEN'}**\n` +
          `* **ബിസിനസ്സ് തിയതി:** ${drawer.business_date || 'Today'}\n` +
          `* **ഓപ്പണിംഗ് ബാലൻസ്:** **${formatMoney(drawer.opening_balance)}**\n` +
          `* **ഇന്നത്തെ ക്യാഷ് സെയിൽസ്:** **${formatMoney(drawer.cash_sales)}**\n` +
          `* **ഡ്രോയറിലെ നിലവിലെ ക്യാഷ്:** **${formatMoney(drawer.current_cash ?? drawer.actual_cash ?? 0)}**\n`
        : `### 💵 Current Cash Drawer Balance\n\n` +
          `* **Drawer Status:** **${drawer.status || 'OPEN'}**\n` +
          `* **Business Date:** ${drawer.business_date || 'Today'}\n` +
          `* **Opening Balance:** **${formatMoney(drawer.opening_balance)}**\n` +
          `* **Recorded Cash Sales:** **${formatMoney(drawer.cash_sales)}**\n` +
          `* **Current Drawer Cash:** **${formatMoney(drawer.current_cash ?? drawer.actual_cash ?? 0)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_MOVEMENTS': {
      let drawer = await fetchCashDrawer();
      if (!drawer) {
        const range = resolveDateRange('today', undefined, undefined, isMal);
        const invs = await fetchInvoices(range.fromDate, range.toDate);
        const pm = calculatePaymentBreakdown(invs);
        const txs = await fetchCashTransactions(range.fromDate, range.toDate);
        const cashIn = txs.filter((t: AiRow) => t.type === 'CASH_IN').reduce((a: number, t: AiRow) => a + (Number(t.amount) || 0), 0);
        const cashOut = txs.filter((t: AiRow) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a: number, t: AiRow) => a + (Number(t.amount) || 0), 0);
        drawer = { cash_in: cashIn, cash_out: cashOut, cash_sales: pm.cash };
      }

      const md = isMal
        ? `### 🔄 ഇന്നത്തെ ക്യാഷ് വരവ്-ചെലവുകൾ (Drawer Movements)\n\n` +
          `* **ക്യാഷ് ഇൻ (Cash In):** **${formatMoney(drawer?.cash_in || 0)}**\n` +
          `* **ക്യാഷ് ഔട്ട് (Cash Out):** **${formatMoney(drawer?.cash_out || 0)}**\n` +
          `* **ക്യാഷ് വിൽപ്പന:** ${formatMoney(drawer?.cash_sales || 0)}\n`
        : `### 🔄 Today's Cash Inflows & Outflows\n\n` +
          `* **Total Cash Inflows (Cash In):** **${formatMoney(drawer?.cash_in || 0)}**\n` +
          `* **Total Cash Outflows (Cash Out):** **${formatMoney(drawer?.cash_out || 0)}**\n` +
          `* **Cash Sales Added:** ${formatMoney(drawer?.cash_sales || 0)}\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_EXPECTED_VS_ACTUAL': {
      const drawer = await fetchCashDrawer();
      if (!drawer || drawer.expected_closing == null) throw new Error('Recorded drawer reconciliation is unavailable');
      if (drawer.actual_cash == null) return { intent: parsed.intent, content: isMal
        ? `പ്രതീക്ഷിച്ച ക്ലോസിംഗ് ക്യാഷ്: **${formatMoney(drawer.expected_closing)}**. എണ്ണിയ ക്യാഷ് ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല. കുറവോ അധികമോ സ്ഥിരീകരിക്കാൻ കഴിയില്ല.`
        : `Expected closing cash: **${formatMoney(drawer.expected_closing)}**. Counted cash has not been recorded yet. A shortage or excess cannot be confirmed.` };

      const md = isMal
        ? `### ⚖️ ക്യാഷ് സെറ്റിൽമെന്റ് താരതമ്യം\n\n` +
          `* **പ്രതീക്ഷിച്ച ക്ലോസിംഗ് ക്യാഷ്:** **${formatMoney(drawer?.expected_closing || 0)}**\n` +
          `* **എണ്ണിയ യഥാർത്ഥ ക്യാഷ്:** **${formatMoney(drawer?.actual_cash || 0)}**\n` +
          `* **വ്യത്യാസം (Short / Excess):** **${formatMoney((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**\n`
        : `### ⚖️ Cash Drawer Reconciliation\n\n` +
          `* **Expected Closing Cash:** **${formatMoney(drawer?.expected_closing || 0)}**\n` +
          `* **Actual Counted Cash:** **${formatMoney(drawer?.actual_cash || 0)}**\n` +
          `* **Settlement Difference:** **${formatMoney((drawer?.actual_cash || 0) - (drawer?.expected_closing || 0))}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_PENDING_UNSETTLED': {
      let pendingInvs: AiRow[] = [];
      if (hasBridge('dbCashierGetPendingInvoices')) {
        try {
          pendingInvs = await cashierApi.getPendingInvoices({ tenant_id: tenantId });
        } catch { /* ignore */ }
      }
      let md = isMal
        ? `### ⏳ ക്യാഷ് സെറ്റിൽമെന്റിൽ ഉൾപ്പെടാത്ത പെൻഡിംഗ് ഇടപാടുകൾ\n\n* **പെൻഡിംഗ് ബില്ലുകൾ:** **${pendingInvs.length} എണ്ണം**\n`
        : `### ⏳ Unsettled Pending Transactions\n\n* **Pending Transactions Awaiting Cash Settlement:** **${pendingInvs.length} invoices**\n`;
      if (pendingInvs.length > 0) {
        md += `\n| Invoice # | Amount | Biller |\n| :--- | :---: | :--- |\n`;
        pendingInvs.slice(0, 10).forEach((inv: AiRow) => {
          md += `| **${inv.invoice_number}** | ${formatMoney(inv.grand_total)} | ${inv.biller_name || 'Counter'} |\n`;
        });
      } else {
        md += `\nAll completed transactions have been properly accounted for in the register (Zero Pending ✅).\n`;
      }
      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_UNSETTLED_STATUS': {
      const todayStr = getStoreBusinessDate();
      let settlements: AiRow[] = [];
      if (hasBridge('dbCashierGetDaySettlements')) {
        try {
          settlements = await cashierApi.getDaySettlements({ tenant_id: tenantId, business_date: todayStr });
        } catch { /* ignore */ }
      }
      const isSettled = settlements.length > 0;
      const md = isMal
        ? `### 📑 ഇന്നത്തെ ക്യാഷ് രജിസ്റ്റർ സെറ്റിൽമെന്റ് നില\n\n* **സെറ്റിൽമെന്റ് നില:** **${isSettled ? 'ഇന്നത്തെ ക്ലോസിംഗ് പൂർത്തിയായി ✅' : 'ക്ലോസ് ചെയ്തിട്ടില്ല (തുറന്നിരിക്കുന്നു 🟢)'}**\n* **പൂർത്തിയായ സെറ്റിൽമെന്റുകൾ:** **${settlements.length} എണ്ണം**\n`
        : `### 📑 Cash Register Day Settlement Status\n\n* **Today's Settlement Status:** **${isSettled ? 'Day Closed & Settled ✅' : 'Open / Unsettled (Shift Active 🟢)'}**\n* **Completed Settlements Recorded:** **${settlements.length} registers**\n`;
      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_BILLER_STATUS': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const billerMap: Record<string, { name: string; count: number; total: number; cash: number }> = {};
      invs.forEach((inv: AiRow) => {
        const b = inv.biller_name || 'Counter Staff';
        if (!billerMap[b]) billerMap[b] = { name: b, count: 0, total: 0, cash: 0 };
        billerMap[b].count++;
        billerMap[b].total += Number(inv.grand_total) || 0;
        if ((inv.payment_method || '').includes('CASH')) billerMap[b].cash += Number(inv.grand_total) || 0;
      });
      const list = Object.values(billerMap);
      let md = isMal
        ? `### 👨‍💼 ബില്ലർ തിരിച്ചുള്ള ക്യാഷ് സെറ്റിൽമെന്റ് നില\n\n`
        : `### 👨‍💼 Biller Cash Settlement Status — Today\n\n`;
      if (list.length > 0) {
        md += `| Biller / Cashier | Invoices | Cash Sales | Total Sales |\n| :--- | :---: | :---: | :---: |\n`;
        list.forEach(b => {
          md += `| **${b.name}** | ${b.count} | ${formatMoney(b.cash)} | **${formatMoney(b.total)}** |\n`;
        });
      } else {
        md += `No cashier billing sessions active today.\n`;
      }
      return { content: md, intent: parsed.intent };
    }

    case 'CASH_DRAWER_SETTLEMENTS': {
      if (!hasBridge('dbCashierGetHistory')) throw new Error('Drawer history is unavailable');
      const rows = await cashierApi.getHistory({ tenant_id: tenantId, limit: 10 });
      if (!Array.isArray(rows)) throw new Error('Drawer history could not be read');
      const heading = isMal ? 'സമീപകാല 10 ക്യാഷ് ഡ്രോയർ രേഖകൾ' : 'Latest 10 cash drawer records';
      if (!rows.length) return { content: `${heading}: ${isMal ? 'രേഖകൾ ഇല്ല.' : 'No records found.'}`, intent: parsed.intent };
      return { content: `### ${heading}\n\n| Business date | Status | Expected | Counted |\n| :--- | :--- | ---: | ---: |\n` + rows.map(r => `| ${r.business_date} | ${r.status} | ${formatMoney(r.expected_closing)} | ${r.actual_cash == null ? 'Not recorded' : formatMoney(r.actual_cash)} |`).join('\n'), intent: parsed.intent };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 15. Bills, Payments & Receivables (4.6)
    // ──────────────────────────────────────────────────────────────────────
    case 'BILLS_UNPAID': {
      const invs = await fetchInvoices('2000-01-01', '2099-12-31');
      const unpaid = invs.filter((i: AiRow) => !i.converted_to_invoice_id && (Number(i.balance_amount) > 0 || i.payment_method === 'CREDIT'));

      const md = isMal
        ? `### 📒 പണം ലഭിക്കാനുള്ള ബില്ലുകൾ (Unpaid Bills)\n\n` +
          `* **ആകെ ബാക്കി നിൽക്കുന്ന ബില്ലുകൾ:** **${unpaid.length} bills**\n`
        : `### 📒 Unpaid Invoices & Receivables\n\n` +
          `* **Total Unpaid Invoices:** **${unpaid.length} bills**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'BILLS_PARTIALLY_PAID': {
      const invs = await fetchInvoices('2000-01-01', '2099-12-31');
      const partial = invs.filter((i: AiRow) => !i.converted_to_invoice_id && Number(i.received_amount) > 0 && Number(i.balance_amount) > 0);

      const md = isMal
        ? `### 📒 ഭാഗികമായി പണം ലഭിച്ച ബില്ലുകൾ (Partially Paid Bills)\n\n` +
          `* **ആകെ ബില്ലുകൾ:** **${partial.length} bills**\n`
        : `### 📒 Partially Paid Invoices\n\n` +
          `* **Partially Paid Bills Today:** **${partial.length} bills**\n`;

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
