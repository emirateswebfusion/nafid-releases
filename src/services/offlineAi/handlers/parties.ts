import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { hasBridge } from '../../../data/client';
import { customersApi } from '../../../data/customers';
import { hasPartyRole } from '../../../data/partyRoles';
import { partiesApi } from '../../../data/parties';
import { resolveDateRange } from '../dates';
import { calculatePaymentBreakdown, formatMoney } from '../format';
import { NOT_HANDLED } from '../queryContext';
import type { AiRow, OfflineAiResponse, ParsedOfflineIntent } from '../types';
import type { AiQueryContext } from '../queryContext';

/** Customer and supplier balances, ledgers, overdue lists and payments. */
export async function handlePartiesIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse | typeof NOT_HANDLED> {
  const { tenantId, isMal, fetchInvoices, fetchCashTransactions, fetchParties } = ctx;
  switch (parsed.intent) {
    // ──────────────────────────────────────────────────────────────────────
    // 13. Customer & Supplier Ledger (4.4)
    // ──────────────────────────────────────────────────────────────────────
    case 'CUSTOMER_CREDIT_LIST': {
      const minAmount = parsed.params.minAmount || 0;
      const partiesPromise = hasBridge('dbGetParties') ? partiesApi.getParties(tenantId) : Promise.resolve([]);
      const customersPromise = hasBridge('dbGetCustomers') ? customersApi.getCustomers({ tenant_id: tenantId }) : Promise.resolve([]);
      const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);

      const debtors: Array<{ name: string; phone: string; balance: number }> = [];
      const seenKeys = new Set<string>();

      [...(partiesList || []), ...(custList || [])].forEach((p: AiRow) => {
        const bal = Math.round((Number(p.current_balance ?? p.balance ?? 0)) * 100) / 100;
        if (hasPartyRole(p.party_type, 'CUSTOMER') && bal > 0 && bal >= minAmount) {
          const key = (p.party_id || p.customer_id || p.phone || p.name || '').toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            debtors.push({ name: p.name as string, phone: p.phone as string, balance: bal });
          }
        }
      });

      debtors.sort((a, b) => b.balance - a.balance);
      const totalOut = debtors.reduce((acc, c) => acc + c.balance, 0);

      if (debtors.length === 0) {
        return {
          content: isMal
            ? (minAmount > 0 ? `${getCurrencyPrefix()}${minAmount.toLocaleString()}-ൽ കൂടുതൽ കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ ഇല്ല.` : `കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ ആരും ഇല്ല.`)
            : (minAmount > 0 ? `No customers found with outstanding credit above ${getCurrencyPrefix()}${minAmount.toLocaleString()}.` : `No customers found with outstanding credit balance.`),
        };
      }

      if (parsed.params.limit === 1 && debtors.length > 0) {
        const top = debtors[0];
        const md = isMal
          ? `### 👤 ഏറ്റവും കൂടുതൽ ക്രെഡിറ്റ് ബാക്കിയുള്ള കസ്റ്റമർ\n\n` +
            `ഏറ്റവും കൂടുതൽ കുടിശ്ശികയുള്ള കസ്റ്റമർ **${top.name}** ആണ്:\n\n` +
            `* **കസ്റ്റമർ പേര്:** **${top.name}**\n` +
            `* **ഫോൺ നമ്പർ:** ${top.phone || '—'}\n` +
            `* **ബാക്കി നിൽക്കുന്ന ക്രെഡിറ്റ്:** **${formatMoney(top.balance)}**\n`
          : `### 👤 Top Credit Customer\n\n` +
            `The customer with the highest outstanding credit balance is **${top.name}**:\n\n` +
            `* **Customer / Party:** **${top.name}**\n` +
            `* **Phone:** ${top.phone || '—'}\n` +
            `* **Outstanding Balance:** **${formatMoney(top.balance)}**\n`;

        return { content: md, intent: parsed.intent };
      }

      let md = isMal
        ? `### 👥 കസ്റ്റമർ കുടിശ്ശിക റിപ്പോർട്ട് (Receivables)\n\n` +
          `* **ആകെ കുടിശ്ശിക (Total Outstanding):** **${formatMoney(totalOut)}**\n` +
          `* **അക്കൗണ്ടുകളുടെ എണ്ണം:** **${debtors.length} accounts**\n\n` +
          `| കസ്റ്റമർ / പാർട്ടി | ഫോൺ | കുടിശ്ശിക |\n| :--- | :---: | :---: |\n`
        : `### 👥 Customer Credit & Receivables Summary\n\n` +
          `* **Total Outstanding Balance:** **${formatMoney(totalOut)}**\n` +
          `* **Total Accounts:** **${debtors.length} accounts**\n\n` +
          `| Customer / Party | Phone | Balance |\n| :--- | :---: | :---: |\n`;

      debtors.slice(0, 15).forEach(c => {
        md += `| **${c.name}** | ${c.phone || '—'} | **${formatMoney(c.balance)}** |\n`;
      });

      return { content: md, intent: parsed.intent };
    }

    case 'SUPPLIER_PAYABLES_TOTAL':
    case 'SUPPLIER_RECEIVABLES':
    case 'CUSTOMER_PAYABLES': {
      const parties = await fetchParties();
      const role = parsed.intent === 'CUSTOMER_PAYABLES' ? 'CUSTOMER' : 'SUPPLIER';
      const receivable = parsed.intent === 'SUPPLIER_RECEIVABLES';
      const accounts = parties.filter(p => hasPartyRole(p.party_type, role))
        .map(p => ({ name: p.name || '—', balance: Number(p.current_balance ?? p.balance ?? 0) }))
        .filter(p => receivable ? p.balance > 0 : p.balance < 0);
      const total = accounts.reduce((sum, p) => sum + Math.abs(p.balance), 0);
      const label = isMal
        ? (receivable ? 'സപ്ലയർമാരിൽ നിന്ന് കിട്ടാനുള്ള തുക / advance' : role === 'CUSTOMER' ? 'കസ്റ്റമർമാർക്ക് നൽകാനുള്ള തുക' : 'സപ്ലയർമാർക്ക് നൽകാനുള്ള തുക')
        : (receivable ? 'Supplier receivables / advances' : role === 'CUSTOMER' ? 'Amounts owed to customers' : 'Amounts owed to suppliers');
      return { intent: parsed.intent, content: `### ${label}\n\n**${formatMoney(total)}** · ${accounts.length} accounts\n\n| Account | Balance |\n| :--- | ---: |\n` + accounts.map(p => `| ${p.name} | ${formatMoney(Math.abs(p.balance))} |`).join('\n') };
    }

    case 'PARTY_BALANCE':
    case 'PARTY_LEDGER': {
      const queryTerm = (parsed.params.searchQuery || '').trim();
      const partiesPromise = hasBridge('dbGetParties') ? partiesApi.getParties(tenantId) : Promise.resolve([]);
      const customersPromise = hasBridge('dbGetCustomers') ? customersApi.getCustomers({ tenant_id: tenantId }) : Promise.resolve([]);
      const [partiesList, custList] = await Promise.all([partiesPromise, customersPromise]);

      const qLower = queryTerm.toLowerCase();
      const matched: AiRow[] = [...(partiesList || []), ...(custList || [])].filter((p: AiRow) =>
        p.name?.toLowerCase().includes(qLower) || (p.phone && String(p.phone).includes(queryTerm))
      );

      if (matched.length === 0) {
        return {
          content: isMal
            ? `"${queryTerm}" എന്ന പേരിൽ കസ്റ്റമറെയോ പാർട്ടിയെയോ കണ്ടെത്താനായില്ല.`
            : `Could not find any customer or party matching "${queryTerm}".`,
        };
      }

      const target = matched[0];
      const rawBal = Number(target.current_balance ?? target.balance ?? 0);
      const absBal = Math.abs(rawBal);
      const balDesc = rawBal > 0
        ? (isMal ? 'പിരിഞ്ഞു കിട്ടാനുള്ളത് (Receivable)' : 'Pending Cash In (Receivable)')
        : rawBal < 0
        ? (isMal ? 'നൽകാനുള്ളത് (Payable)' : 'Pending Cash Out (Payable)')
        : (isMal ? 'കുടിശ്ശികയില്ല' : 'Settled (Nil)');

      let md = `### 📒 Ledger Account: **${target.name}**\n\n` +
        `* **Phone Number:** ${target.phone || 'N/A'}\n` +
        `* **Current Balance:** **${formatMoney(absBal)}** (${balDesc})\n`;

      if (target.party_id && hasBridge('dbGetPartyLedger')) {
        try {
          const entries = await partiesApi.getPartyLedger(target.party_id);
          if (entries && entries.length > 0) {
            md += `\n#### Recent Transactions:\n` +
              `| Date | Description | Debit (-) | Credit (+) | Running Balance |\n` +
              `| :---: | :--- | :---: | :---: | :---: |\n`;

            entries.slice(0, 10).forEach((entry: AiRow) => {
              const d = entry.transaction_date ? String(entry.transaction_date).split('T')[0] : '—';
              const dr = (entry.debit_amount as number) > 0 ? formatMoney(entry.debit_amount) : '—';
              const cr = (entry.credit_amount as number) > 0 ? formatMoney(entry.credit_amount) : '—';
              const rb = formatMoney(Math.abs(Number(entry.running_balance || 0)));
              md += `| ${d} | ${entry.description || 'Entry'} | ${dr} | ${cr} | **${rb}** |\n`;
            });
          }
        } catch { /* ignore */ }
      }

      return { content: md, intent: parsed.intent };
    }

    case 'CUSTOMER_OVERDUE_LIST': {
      if (!hasBridge('dbGetCustomers')) throw new Error('Customer overdue records are unavailable');
      const customers = await customersApi.getCustomers({ tenant_id: tenantId });
      if (!Array.isArray(customers)) throw new Error('Customer overdue records are unavailable');
      const overdue = customers.filter(p => p.has_overdue === true && Number(p.overdue_amount) > 0)
        .map(p => ({ name: p.name, phone: p.phone || '—', balance: Number(p.overdue_amount) }));

      overdue.sort((a, b) => b.balance - a.balance);
      const total = overdue.reduce((acc, c) => acc + c.balance, 0);

      let md = isMal
        ? `### ⚠️ കസ്റ്റമർ കുടിശ്ശിക ലിസ്റ്റ് (Overdue Receivables)\n\n` +
          `* **കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ:** **${overdue.length} പേർ**\n` +
          `* **ആകെ കുടിശ്ശിക തുക:** **${formatMoney(total)}**\n\n`
        : `### ⚠️ Overdue Customer Receivables List\n\n` +
          `* **Overdue Debtors Count:** **${overdue.length} customers**\n` +
          `* **Total Overdue Receivables:** **${formatMoney(total)}**\n\n`;

      if (overdue.length > 0) {
        md += `| Customer Name | Phone | Outstanding Due |\n| :--- | :---: | :---: |\n`;
        overdue.slice(0, 15).forEach((c) => {
          md += `| **${c.name}** | ${c.phone || '—'} | **${formatMoney(c.balance)}** |\n`;
        });
      }

      return { content: md, intent: parsed.intent };
    }

    case 'CUSTOMER_PAYMENTS_COLLECTED_TODAY': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const collections = txs.filter((t: AiRow) => (t.type === 'CASH_IN' || t.transaction_type === 'CASH_IN') && t.category?.replaceAll('_', ' ').trim().toLowerCase() === 'customer payment');
      const total = collections.reduce((acc: number, t: AiRow) => acc + (Number(t.amount) || 0), 0);

      const md = isMal
        ? `### 💵 Customer Payment വിഭാഗത്തിലെ ഇന്നത്തെ ക്യാഷ് വരവ്\n\n* **ആകെ ശേഖരിച്ച തുക:** **${formatMoney(total)}**\n* **രസീതുകൾ:** **${collections.length} എണ്ണം**\n\nCustomer Payment എന്ന് രേഖപ്പെടുത്തിയ ക്യാഷ് വരവുകൾ മാത്രം. Party ledger receipts, മറ്റ് payment methods എന്നിവയുടെ സമ്പൂർണ്ണ പിരിവല്ല.\n`
        : `### 💵 Cash receipts labelled Customer Payment today\n\n* **Total Amount Collected Today:** **${formatMoney(total)}**\n* **Receipts Count:** **${collections.length} transactions**\n\nOnly cash-in records explicitly labelled Customer Payment are included. This is not a complete total of linked party-ledger receipts or other payment methods.\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'CUSTOMER_CREDIT_GIVEN_TODAY': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const invs = await fetchInvoices(range.fromDate, range.toDate);
      const pm = calculatePaymentBreakdown(invs);

      const md = isMal
        ? `### 📒 ഇന്ന് നൽകിയ കസ്റ്റമർ ക്രെഡിറ്റ് (Credit Sales Today)\n\n* **ആകെ ക്രെഡിറ്റ് തുക:** **${formatMoney(pm.credit)}**\n`
        : `### 📒 Credit Extended to Customers Today\n\n* **Total Credit Sales Today:** **${formatMoney(pm.credit)}**\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SUPPLIER_PAYMENTS_TODAY': {
      const range = resolveDateRange('today', undefined, undefined, isMal);
      const txs = await fetchCashTransactions(range.fromDate, range.toDate);
      const supplierTxs = txs.filter((t: AiRow) => (t.type === 'CASH_OUT' || t.transaction_type === 'CASH_OUT') && (t.category === 'SUPPLIER_PAYMENT' || t.party_type === 'SUPPLIER'));
      const total = supplierTxs.reduce((acc: number, t: AiRow) => acc + (Number(t.amount) || 0), 0);

      const md = isMal
        ? `### 🏢 ഇന്ന് സപ്ലയർമാർക്ക് നൽകിയ പണം\n\n* **ആകെ നൽകിയ തുക:** **${formatMoney(total)}**\n* **ഇടപാടുകൾ:** **${supplierTxs.length} എണ്ണം**\n`
        : `### 🏢 Supplier Payments Disbursed Today\n\n* **Total Paid to Suppliers Today:** **${formatMoney(total)}**\n* **Transactions:** **${supplierTxs.length} vouchers**\n`;

      return { content: md, intent: parsed.intent };
    }

    default:
      return NOT_HANDLED;
  }
}
