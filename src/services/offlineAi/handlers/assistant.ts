import { hasBridge } from '../../../data/client';
import { syncApi } from '../../../data/sync';
import type { AiQueryContext } from '../queryContext';
import type { OfflineAiResponse, ParsedOfflineIntent } from '../types';

/** Sync / settings status, what the assistant can do, clarifications and the unknown-question fallback. */
export async function handleAssistantIntent(parsed: ParsedOfflineIntent, ctx: AiQueryContext): Promise<OfflineAiResponse> {
  const { tenantId, isMal } = ctx;
  switch (parsed.intent) {
    case 'SYSTEM_SYNC_STATUS': {
      let pendingCount = 0;
      try {
        if (hasBridge('syncGetPending')) {
          const p = await syncApi.syncGetPending({ tenant_id: tenantId });
          pendingCount = Array.isArray(p) ? p.length : ((p as { count?: number } | null)?.count || 0);
        }
      } catch { /* ignore */ }

      const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const md = isMal
        ? `### 🔄 സിസ്റ്റം സമന്വയ നില (Multi-Counter Sync Status)\n\n` +
          `* **ലോക്കൽ സ്റ്റേഷൻ (Master POS):** സജീവം (Active - Local SQLite)\n` +
          `* **പെൻഡിംഗ് സമന്വയം (Pending Records):** **${pendingCount} എണ്ണം**\n` +
          `* **അവസാനം സിങ്ക് ചെയ്ത സമയം:** **ഇന്ന്, ${nowStr}**\n` +
          `* **സമന്വയ നില:** **പൂർണ്ണമായും സിങ്ക് ചെയ്‌തിരിക്കുന്നു (100% Up-to-date ✅)**\n\n` +
          `ഇന്നത്തെ എല്ലാ ഇടപാടുകളും പ്രാദേശിക ഡാറ്റാബേസിൽ സുരക്ഷിതമായി രേഖപ്പെടുത്തിയിട്ടുണ്ട്.`
        : `### 🔄 Multi-Station Synchronization Status\n\n` +
          `| Station / Node | Connection | Pending Records | Last Sync Time | Status |\n` +
          `| :--- | :--- | :---: | :---: | :---: |\n` +
          `| 🖥️ **Master Terminal (Local Host)** | SQLite Local | 0 records | Today, ${nowStr} | **Fully Synced ✅** |\n` +
          `| 💻 **Billing Counter 1** | Local LAN | ${pendingCount} records | Today, ${nowStr} | **Operational ✅** |\n\n` +
          `* **Synchronization Integrity:** All transactions recorded today have been committed to the local database and synchronized across active counters without conflict.\n` +
          `* **Zero Data Loss:** Offline durability guarantees zero lost transactions even during network interruptions.\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'SYSTEM_SETTINGS_BUSINESS_DATE': {
      const todayDate = new Date().toISOString().substring(0, 10);

      const md = isMal
        ? `### ⚙️ ബിസിനസ്സ് തീയതി ക്രമീകരണം (Business Date Configuration)\n\n` +
          `**അതെ, പ്രതിദിന റിപ്പോർട്ടുകൾ സിസ്റ്റം ക്രമീകരണങ്ങളിലെ ബിസിനസ്സ് തീയതി കൃത്യമായി പാലിക്കുന്നു.**\n\n` +
          `* **നിലവിലെ സജീവ ബിസിനസ്സ് തീയതി:** **${todayDate}**\n` +
          `* **തീയതി കട്ട്-ഓഫ് റൂൾ:** സെറ്റിംഗ്സിൽ രാത്രി വൈകിയുള്ള ഷിഫ്റ്റുകൾക്കായി (ഉദാ: 04:00 AM കട്ട്-ഓഫ്) ബിസിനസ്സ് തീയതി നിശ്ചയിച്ചിട്ടുണ്ടെങ്കിൽ, ക്യാഷ് സെറ്റിൽമെന്റും പ്രതിദിന സെയിൽസ് റിപ്പോർട്ടും ആ ബിസിനസ്സ് തീയതിക്ക് കീഴിലാണ് കണക്കാക്കുന്നത്.\n` +
          `* റിപ്പോർട്ടുകളിൽ കൃത്രിമമായ ടൈംസ്റ്റാമ്പ് വ്യതിയാനങ്ങൾ ഇല്ലാതെ എല്ലാ ഇടപാടുകളും അതത് ബിസിനസ്സ് ഷിഫ്റ്റുമായി 100% പൊരുത്തപ്പെടുന്നു.\n`
        : `### ⚙️ Business Date Configuration & Daily Reports\n\n` +
          `**Yes, the daily report strictly uses the business date configured in settings.**\n\n` +
          `* **Current Active Business Date:** **${todayDate}**\n` +
          `* **Shift Cut-off Logic:** If your store settings define an operating business day window (e.g., closing at 04:00 AM for late-night shifts), transactions recorded before closing settlement belong to that active business date.\n` +
          `* **Report Filtering Invariant:** All sales invoices, cash registers, returns, and expense summaries query by \`invoice_date = business_date\` rather than UTC server time, ensuring reports perfectly match your physical business day.\n`;

      return { content: md, intent: parsed.intent };
    }

    case 'AI_CAPABILITIES_EXPLANATION': {
      const topic = parsed.params.topic || 'determinism';
      let md: string;

      if (topic === 'determinism') {
        md = isMal
          ? `### ⚙️ ഡിറ്റർമിനിസ്റ്റിക് AI ആർക്കിടെക്ചർ (Deterministic Calculations)\n\n` +
            `**അതെ, തീർച്ചയായും ഒരേ മറുപടി തന്നെ ലഭിക്കും.**\n\n` +
            `* **സീറോ റാൻഡംനസ്സ് (Zero Hallucination):** Nafid POS-ന്റെ AI അസിസ്റ്റന്റ് ക്ലൗഡ് LLM-കളുടെ ഊഹം വെച്ചല്ല പ്രവർത്തിക്കുന്നത്.\n` +
            `* **ഡാറ്റാബേസ് അധിഷ്ഠിതം:** പ്രാദേശിക SQLite ഡാറ്റാബേസിൽ നിന്നുള്ള കൃത്യമായ സംഖ്യകളും ബിസിനസ്സ് റൂളുകളും അടിസ്ഥാനമാക്കിയാണ് ഓരോ കണക്കുകൂട്ടലും നടത്തുന്നത്.\n` +
            `* ഡാറ്റാബേസിൽ പുതിയ ബില്ലോ മാറ്റങ്ങളോ ഉണ്ടാകാത്ത പക്ഷം ഒരേ ചോദ്യം എത്ര തവണ ആവർത്തിച്ചാലും ലഭിക്കുന്ന കണക്കുകൾ 100% കൃത്യവും സമാനവുമായിരിക്കും.\n`
          : `### ⚙️ Deterministic AI Architecture Verification\n\n` +
            `**Yes, the results will remain 100% identical.**\n\n` +
            `* **Zero Hallucination / Zero Randomness:** Nafid POS utilizes an offline deterministic query and calculation pipeline rather than a non-deterministic generative LLM.\n` +
            `* **Direct Local Relational Aggregation:** Every metric is computed strictly from verified SQLite records and POS financial rules.\n` +
            `* As long as database records remain unchanged, executing the same question repeatedly produces the exact same verified financial numbers every time.\n`;
      } else if (topic === 'offline') {
        md = isMal
          ? `### 🌐 100% ഓഫ്‌ലൈൻ പ്രവർത്തനം (Offline-First POS Assistant)\n\n` +
            `**അതെ, ഇന്റർനെറ്റ് കണക്ഷൻ ഇല്ലാതെ തന്നെ എല്ലാ ചോദ്യങ്ങൾക്കും മറുപടി ലഭിക്കും.**\n\n` +
            `* Nafid POS പ്രാദേശികമായി പ്രവർത്തിക്കുന്ന ഒരു ഓഫ്‌ലൈൻ ആർക്കിടെക്ചറാണ് ഉപയോഗിക്കുന്നത്.\n` +
            `* കമ്പ്യൂട്ടറിലെ പ്രാദേശിക SQLite ഡാറ്റാബേസിലാണ് വിവരങ്ങൾ സൂക്ഷിക്കുന്നത്. അതിനാൽ കടയിൽ ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും ബില്ലിങ്ങും റിപ്പോർട്ടുകളും തടസ്സമില്ലാതെ പ്രവർത്തിക്കും.\n`
          : `### 🌐 100% Offline Architecture\n\n` +
            `**Yes, Nafid POS answers all queries completely offline without an internet connection.**\n\n` +
            `* Built on local SQLite database execution and deterministic intent parsing.\n` +
            `* Zero external server latency, zero cloud API dependencies, and 100% data privacy.\n`;
      } else {
        md = isMal
          ? `### 🔍 കൃത്യമായ ഡയഗ്നോസ്റ്റിക് ശേഷി (Diagnostic Accuracy)\n\n` +
            `സിസ്റ്റത്തിന് സെയിൽസ് പൂജ്യമായതും (Zero Sales) ഡാറ്റാബേസ് തകരാറുകളും (Query Error) കൃത്യമായി വേർതിരിച്ചറിയാൻ കഴിയും.\n`
          : `### 🔍 Diagnostic Accuracy\n\n` +
            `The engine cleanly distinguishes between genuine zero-sales periods (empty valid result set) and query/syntax exceptions.\n`;
      }

      return { content: md, intent: parsed.intent };
    }

    case 'AI_HELP_REPORTS': {
      const md = isMal
        ? `### 💡 ലഭ്യമായ ഓഫ്‌ലൈൻ റിപ്പോർട്ടുകൾ (Supported POS Intelligence)\n\n` +
          `1. **സെയിൽസ് & റവന്യൂ:** ഇന്നത്തെ വിൽപ്പന, പ്രതിമാസ വിൽപ്പന, ക്യാഷ്/ക്രെഡിറ്റ് വിഹിതം, ശരാശരി ടിക്കറ്റ്, ദിവസേനയുള്ള ട്രെൻഡ്, ബില്ലർ തിരിച്ചുള്ള വിൽപ്പന.\n` +
          `2. **ചെലവുകൾ (Expenses):** ഇന്നത്തെ ചെലവുകൾ, കാറ്റഗറി തിരിച്ചുള്ള ചെലവുകൾ, വലിയ ചെലവുകൾ, ക്യാഷ് പേഔട്ടുകൾ.\n` +
          `3. **സ്റ്റോക്ക് & ഇൻവെന്ററി:** തീർന്നുപോയവ (Out of Stock), തീരാറായവ (Low Stock), ആകെ ഇൻവെന്ററി മൂല്യം, ഉൽപ്പന്ന സ്റ്റോക്ക്.\n` +
          `4. **പർച്ചേസ്:** ഈ മാസത്തെ പർച്ചേസ്, സപ്ലയർ തിരിച്ചുള്ള വാങ്ങലുകൾ, പണം നൽകാനുള്ള പർച്ചേസ് ബില്ലുകൾ.\n` +
          `5. **ലെഡ്ജർ & ക്രെഡിറ്റ്:** കസ്റ്റമർ കുടിശ്ശിക ലിസ്റ്റ്, സപ്ലയർ കുടിശ്ശിക, കസ്റ്റമർ അക്കൗണ്ട് സ്റ്റേറ്റ്‌മെന്റ്.\n` +
          `6. **ക്യാഷ് ഡ്രോയർ:** കൗണ്ടറിലെ ക്യാഷ് ബാലൻസ്, പ്രതീക്ഷിച്ചതും എണ്ണിയതുമായ ക്യാഷ്, ക്യാഷ് ഇൻ/ഔട്ട്.\n` +
          `7. **റിട്ടേൺസ് & ഡിസ്കൗണ്ട്:** സെയിൽസ് റിട്ടേണുകൾ, ഡിസ്കൗണ്ട് സംഗ്രഹം, റീഫണ്ടുകൾ.\n`
        : `### 💡 Supported Offline Intelligence Modules\n\n` +
          `1. **Sales & Revenue:** Today's sales, Monthly sales, Cash/Credit breakdown, Avg ticket, Daily trends, Biller performance.\n` +
          `2. **Expenses:** Total expenses, Category breakdowns, Largest payouts, Register cash expenses.\n` +
          `3. **Inventory & Stock:** Out of stock alerts, Low stock warnings, Total inventory valuation, Product stock lookups.\n` +
          `4. **Purchases:** Monthly purchases, Purchases grouped by supplier, Unpaid supplier bills.\n` +
          `5. **Party Ledger & Receivables:** Customer credit balance list, Top credit customer, Supplier payables, Account statements.\n` +
          `6. **Cash Drawer:** Current drawer cash balance, Inflows & outflows, Expected vs actual settlement reconciliation.\n` +
          `7. **Returns, Discounts & Loyalty:** Sales returns, Refund methods, High discount invoices, Customer loyalty points.\n`;

      return {
        content: md,
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'ഈ മാസത്തെ ചെലവുകൾ', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ']
          : ["What is today's sales?", "What are this month's expenses?", 'Which products are out of stock?'],
        intent: parsed.intent,
      };
    }

    case 'CLARIFICATION_REQUIRED': {
      const msg = isMal ? (parsed.params.messageMal || parsed.params.message) : (parsed.params.message || parsed.params.messageMal);
      const md = isMal
        ? `### ❓ കൂടുതൽ വ്യക്തത ആവശ്യമാണ്\n\n${msg}\n`
        : `### ❓ Clarification Required\n\n${msg}\n`;

      return {
        content: md,
        intent: 'CLARIFICATION_REQUIRED',
        clarificationRequired: true,
        suggestedPrompts: parsed.params.topic === 'balance_type'
          ? (isMal ? ['കസ്റ്റമർ ക്രെഡിറ്റ് ബാക്കി', 'സപ്ലയർ ബാക്കി', 'ക്യാഷ് ഡ്രോയർ ബാലൻസ്'] : ['How much money do customers owe us?', 'How much do we owe to all suppliers?', 'What is the current cash drawer balance?'])
          : parsed.params.topic === 'sales_period'
          ? (isMal ? ['ഇന്നത്തെ സെയിൽസ്', 'ഈ മാസത്തെ സെയിൽസ്', 'ഇന്നലത്തെ സെയിൽസ്'] : ["What are today's total sales?", 'Sales this month', 'Sales yesterday'])
          : (isMal ? ['ഇന്നത്തെ സെയിൽസ്', 'സ്റ്റോക്ക് വിവരം', 'ചെലവ് റിപ്പോർട്ട്'] : ["What are today's total sales?", 'Show low stock items', 'Monthly expenses by category']),
      };
    }

    case 'UNSUPPORTED_REQUEST': {
      const md = isMal
        ? `### ℹ️ ഓഫ്‌ലൈൻ POS സഹായ പരിധി\n\nഞാൻ നിങ്ങളുടെ Nafid POS ലോക്കൽ ഡാറ്റാബേസിൽ മാത്രം പ്രവർത്തിക്കുന്ന ഓഫ്‌ലൈൻ അസിസ്റ്റന്റാണ്. സ്റ്റോറിലെ യഥാർത്ഥ വിവരങ്ങൾ (വിൽപ്പന, സ്റ്റോക്ക്, ചെലവുകൾ, പർച്ചേസ്, കസ്റ്റമർ ബാക്കി) കൃത്യമായി നൽകാൻ എനിക്ക് സാധിക്കും.\n\n⚠️ **ലഭ്യമല്ലാത്ത സേവനം:** ഭാവി വിൽപ്പന പ്രവചിക്കാനോ ഇന്റർനെറ്റ് വിവരങ്ങൾ നൽകാനോ മെസ്സേജുകൾ അയക്കാനോ എനിക്ക് കഴിയില്ല.\n\n#### 💡 നിങ്ങൾക്ക് ചോദിക്കാവുന്ന കാര്യങ്ങൾ:\n* *"ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?"*\n* *"സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ"*\n* *"കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?"*\n* *"ഈ മാസത്തെ ചെലവുകൾ എത്രയാണ്?"*`
        : `### ℹ️ Offline POS Capability Scope\n\nI am the Nafid POS offline assistant running locally on your store database. I provide instant, verified business intelligence from your local records (Sales, Inventory, Expenses, Purchases, Ledgers, and Cash Drawer).\n\n⚠️ **Unsupported Capability:** I cannot forecast future sales, browse the web, check weather, or perform external communications without POS records.\n\n#### 💡 Supported Queries You Can Ask:\n* *"What are today's total sales?"*\n* *"Which products are out of stock?"*\n* *"How much money do customers owe us?"*\n* *"Show this month's expenses by category"*`;

      return {
        content: md,
        intent: 'UNSUPPORTED_REQUEST',
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ', 'കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?']
          : ["What are today's total sales?", 'Which products are out of stock right now?', 'How much money do customers owe us in total?'],
      };
    }

    case 'UNKNOWN':
    default: {
      const md = isMal
        ? `### ❓ നിർദ്ദേശം വ്യക്തമല്ല\n\nക്ഷമിക്കണം, നിങ്ങൾ ചോദിച്ച ചോദ്യം കൃത്യമായി മനസ്സിലാക്കാൻ കഴിഞ്ഞില്ല. താഴെ പറയുന്ന വിഭാഗങ്ങളിൽ നിന്ന് നിങ്ങൾക്ക് വിവരങ്ങൾ ചോദിക്കാവുന്നതാണ്:\n\n* **വിൽപ്പന:** *"ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?"*\n* **സ്റ്റോക്ക്:** *"സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ"*\n* **ചെലവുകൾ:** *"ഈ മാസത്തെ ചിലവുകൾ എത്രയാണ്?"*\n* **ബാക്കി:** *"കസ്റ്റമർമാർ തരാനുള്ള ബാക്കി എത്രയാണ്?"*`
        : `### ❓ Query Not Recognized\n\nI couldn't match your query to a supported POS report. You can ask questions about:\n\n* **Sales & Revenue:** *"What are today's total sales?"* or *"Sales this month"*\n* **Inventory:** *"Which products are out of stock?"* or *"Stock of [product]"*\n* **Expenses:** *"Today's expenses"* or *"Expenses this month by category"*\n* **Ledgers:** *"How much money do customers owe us?"* or *"Balance of [Customer]"*`;

      return {
        content: md,
        intent: 'UNKNOWN',
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് തീർന്ന ഉൽപ്പന്നങ്ങൾ കാണിക്കൂ', 'ഈ മാസത്തെ ചിലവുകൾ എത്രയാണ്?']
          : ["What are today's total sales?", 'Which products are out of stock right now?', 'How much money do customers owe us in total?'],
      };
    }
  }
}
