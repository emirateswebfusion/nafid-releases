/**
 * "What's New in Nafid" cards shown in Settings → Appearance. User-facing wording only (no technical terms).
 * Replace the whole list on each release; keep English (`en`) and Malayalam (`ml`) for every text.
 * `accent` holds complete Tailwind class names so the build keeps them.
 */
export interface WhatsNewItem {
  title: { en: string; ml: string };
  tag: { en: string; ml: string };
  /** One-line English summary shown under the Malayalam title. */
  subtitle: string;
  text: { en: string; ml: string };
  accent: { dot: string; tag: string; text: string; hover: string };
}

const ACCENT = {
  emerald: { dot: 'bg-emerald-500', tag: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:border-emerald-500/40 hover:bg-emerald-500/[0.02]' },
  violet: { dot: 'bg-violet-500', tag: 'text-violet-600 dark:text-violet-400 bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', hover: 'hover:border-violet-500/40 hover:bg-violet-500/[0.02]' },
  blue: { dot: 'bg-blue-500', tag: 'text-blue-600 dark:text-blue-400 bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', hover: 'hover:border-blue-500/40 hover:bg-blue-500/[0.02]' },
  rose: { dot: 'bg-rose-500', tag: 'text-rose-600 dark:text-rose-400 bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', hover: 'hover:border-rose-500/40 hover:bg-rose-500/[0.02]' },
  amber: { dot: 'bg-amber-500', tag: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', hover: 'hover:border-amber-500/40 hover:bg-amber-500/[0.02]' },
  teal: { dot: 'bg-teal-500', tag: 'text-teal-600 dark:text-teal-400 bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', hover: 'hover:border-teal-500/40 hover:bg-teal-500/[0.02]' },
  indigo: { dot: 'bg-indigo-500', tag: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', hover: 'hover:border-indigo-500/40 hover:bg-indigo-500/[0.02]' },
  sky: { dot: 'bg-sky-500', tag: 'text-sky-600 dark:text-sky-400 bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', hover: 'hover:border-sky-500/40 hover:bg-sky-500/[0.02]' },
  orange: { dot: 'bg-orange-500', tag: 'text-orange-600 dark:text-orange-400 bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', hover: 'hover:border-orange-500/40 hover:bg-orange-500/[0.02]' },
};

export const WHATS_NEW: WhatsNewItem[] = [
  {
    title: { en: 'Filing-only Bill', ml: 'ഫയലിംഗ്-ഒൺലി ബിൽ' },
    tag: { en: 'New', ml: 'പുതിയത്' },
    subtitle: 'GST bills for tax filing, kept out of sales',
    text: {
      en: 'A new "Filing-only" button on the Billing screen makes GST bills only for tax filing. You choose in Settings whether these bills reduce stock or count as sales. They do not change your cash, customer balance or points.',
      ml: 'ടാക്സ് ഫയലിംഗിന് മാത്രമുള്ള GST ബില്ലുകൾ ഉണ്ടാക്കാൻ ബില്ലിംഗ് സ്ക്രീനിൽ പുതിയ "Filing-only" ബട്ടൺ. ഇവ സ്റ്റോക്ക് കുറയ്ക്കണോ, സെയിൽസിൽ ഉൾപ്പെടുത്തണോ എന്ന് സെറ്റിംഗ്സിൽ തീരുമാനിക്കാം. ക്യാഷ്, കസ്റ്റമർ ബാലൻസ്, പോയിന്റുകൾ എന്നിവയെ ബാധിക്കില്ല.',
    },
    accent: ACCENT.emerald,
  },
  {
    title: { en: 'Choose What Counts as Sales', ml: 'സെയിൽസിൽ എന്ത് ഉൾപ്പെടുത്തണം' },
    tag: { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' },
    subtitle: 'Leave B2B or B2C bills out of daily sales',
    text: {
      en: 'Turn on an option in Settings to leave B2B or B2C bills out of your daily sales totals. It applies to new bills only, so your past totals never change.',
      ml: 'B2B അല്ലെങ്കിൽ B2C ബില്ലുകൾ ദിവസ സെയിൽസ് കണക്കിൽ നിന്ന് ഒഴിവാക്കാൻ സെറ്റിംഗ്സിൽ ഓപ്ഷൻ. പുതിയ ബില്ലുകൾക്ക് മാത്രമാണ് ബാധകം, പഴയ കണക്കുകൾ മാറില്ല.',
    },
    accent: ACCENT.violet,
  },
  {
    title: { en: 'Faster Sales History', ml: 'വേഗതയേറിയ സെയിൽസ് ഹിസ്റ്ററി' },
    tag: { en: 'Speed', ml: 'വേഗത' },
    subtitle: 'Opens instantly, with clear GST totals',
    text: {
      en: 'Sales History now opens in under a second, even with thousands of bills. It also shows Sales without GST, the GST amount and the Grand Total with GST separately.',
      ml: 'ആയിരക്കണക്കിന് ബില്ലുകൾ ഉണ്ടെങ്കിലും സെയിൽസ് ഹിസ്റ്ററി ഒരു സെക്കൻഡിനുള്ളിൽ തുറക്കും. GST ഇല്ലാത്ത സെയിൽസ്, GST തുക, GST ഉൾപ്പെടെയുള്ള ആകെ തുക എന്നിവ വേറെ വേറെ കാണിക്കുന്നു.',
    },
    accent: ACCENT.blue,
  },
  {
    title: { en: 'Safer Returns', ml: 'കൂടുതൽ സുരക്ഷിതമായ റിട്ടേൺ' },
    tag: { en: 'Returns', ml: 'റിട്ടേൺ' },
    subtitle: 'Quantity starts at 0, totals are exact',
    text: {
      en: 'Return quantity now starts at 0, so you only enter what the customer brings back. Return totals with discount and GST are now exact, and a cash return is taken out of the cash register (you can change this in Settings).',
      ml: 'റിട്ടേൺ അളവ് ഇനി 0 മുതൽ തുടങ്ങും, കസ്റ്റമർ തിരിച്ചു തരുന്നത് മാത്രം എന്റർ ചെയ്താൽ മതി. ഡിസ്കൗണ്ടും GST-യും ഉള്ള റിട്ടേൺ തുക കൃത്യമായി കണക്കാക്കുന്നു. ക്യാഷ് റിട്ടേൺ ക്യാഷ് രജിസ്റ്ററിൽ നിന്ന് കുറയും (സെറ്റിംഗ്സിൽ മാറ്റാം).',
    },
    accent: ACCENT.rose,
  },
  {
    title: { en: 'Cash Register Your Way', ml: 'നിങ്ങളുടെ രീതിയിൽ ക്യാഷ് രജിസ്റ്റർ' },
    tag: { en: 'Cash', ml: 'ക്യാഷ്' },
    subtitle: 'Pick payment methods, scrap and ledger options',
    text: {
      en: 'Choose which payment methods (UPI, Card and more) appear in the Cash Register, and whether scrap sales and ledger cash entries are included. A converted GST bill is no longer counted twice in cash.',
      ml: 'ക്യാഷ് രജിസ്റ്ററിൽ ഏതൊക്കെ പേയ്മെന്റ് രീതികൾ (UPI, കാർഡ് മുതലായവ) കാണിക്കണമെന്നും, സ്ക്രാപ്പ് വിൽപ്പനയും ലെഡ്ജർ ക്യാഷും ഉൾപ്പെടുത്തണോ എന്നും തിരഞ്ഞെടുക്കാം. GST ആക്കി മാറ്റിയ ബിൽ ഇനി ക്യാഷിൽ രണ്ടുതവണ കണക്കാക്കില്ല.',
    },
    accent: ACCENT.amber,
  },
  {
    title: { en: 'Better WhatsApp Messages', ml: 'മെച്ചപ്പെട്ട വാട്സാപ്പ് മെസ്സേജുകൾ' },
    tag: { en: 'WhatsApp', ml: 'വാട്സാപ്പ്' },
    subtitle: 'Bill format, party types and supplier balances',
    text: {
      en: 'Choose how bills are shared (text, A4 PDF or receipt). Pick which party types get ledger messages. Supplier messages now show the opening balance, purchase and closing balance correctly. The closing report can show scrap in detail.',
      ml: 'ബില്ലുകൾ എങ്ങനെ അയക്കണമെന്ന് (ടെക്സ്റ്റ്, A4 PDF, രസീത്) തിരഞ്ഞെടുക്കാം. ലെഡ്ജർ മെസ്സേജ് ഏതൊക്കെ പാർട്ടി തരങ്ങൾക്ക് അയക്കണമെന്നും തീരുമാനിക്കാം. സപ്ലയർ മെസ്സേജിൽ പഴയ ബാലൻസ്, പർച്ചേസ്, ബാക്കി എന്നിവ കൃത്യമായി കാണിക്കും. ക്ലോസിംഗ് റിപ്പോർട്ടിൽ സ്ക്രാപ്പ് വിശദമായി കാണാം.',
    },
    accent: ACCENT.teal,
  },
  {
    title: { en: 'Accurate Loyalty Points', ml: 'കൃത്യമായ ലോയൽറ്റി പോയിന്റുകൾ' },
    tag: { en: 'Points', ml: 'പോയിന്റ്' },
    subtitle: 'Correct balances after returns and edits',
    text: {
      en: 'Customer points now stay correct when a bill is returned, edited or cancelled. When you turn points off in Settings, they are fully hidden and no points are given or used.',
      ml: 'ബിൽ റിട്ടേൺ ചെയ്യുമ്പോഴും, എഡിറ്റ് ചെയ്യുമ്പോഴും, ക്യാൻസൽ ചെയ്യുമ്പോഴും കസ്റ്റമർ പോയിന്റുകൾ കൃത്യമായിരിക്കും. സെറ്റിംഗ്സിൽ പോയിന്റ് ഓഫ് ചെയ്താൽ എവിടെയും കാണിക്കില്ല, പോയിന്റ് നൽകുകയോ ഉപയോഗിക്കുകയോ ഇല്ല.',
    },
    accent: ACCENT.indigo,
  },
  {
    title: { en: 'Better Receipt Printing', ml: 'മെച്ചപ്പെട്ട രസീത് പ്രിന്റിംഗ്' },
    tag: { en: 'Printing', ml: 'പ്രിന്റിംഗ്' },
    subtitle: 'Centred text and long bills on one paper',
    text: {
      en: 'Thermal receipts now print centred on the paper, and long bills print as one continuous receipt instead of splitting across two papers. A margin adjustment is available if your printer needs it.',
      ml: 'തെർമൽ രസീതുകൾ ഇനി പേപ്പറിന്റെ നടുവിൽ കൃത്യമായി പ്രിന്റ് ചെയ്യും. നീണ്ട ബില്ലുകൾ രണ്ട് പേപ്പറുകളായി മുറിയാതെ ഒറ്റ രസീതായി വരും. ആവശ്യമെങ്കിൽ മാർജിൻ ക്രമീകരിക്കാം.',
    },
    accent: ACCENT.sky,
  },
  {
    title: { en: 'Fixes You Asked For', ml: 'നിങ്ങൾ ആവശ്യപ്പെട്ട തിരുത്തലുകൾ' },
    tag: { en: 'Fixes', ml: 'തിരുത്തൽ' },
    subtitle: 'Purchases, paper stock, suppliers, payments',
    text: {
      en: 'Products in purchase bills now reach Inventory correctly. Paper stock settings now take effect. The supplier form shows only supplier fields. Payment methods chosen in Cash Settlement now appear on the Payment Methods page.',
      ml: 'പർച്ചേസ് ബില്ലിലെ ഉൽപ്പന്നങ്ങൾ ഇനി ഇൻവെന്ററിയിൽ കൃത്യമായി എത്തും. പേപ്പർ സ്റ്റോക്ക് സെറ്റിംഗ്സ് ശരിയായി പ്രവർത്തിക്കും. സപ്ലയർ ഫോമിൽ സപ്ലയർക്ക് ആവശ്യമുള്ളത് മാത്രം കാണിക്കും. ക്യാഷ് സെറ്റിൽമെന്റിൽ തിരഞ്ഞെടുത്ത പേയ്മെന്റ് രീതികൾ പേയ്മെന്റ് മെത്തേഡ്സ് പേജിലും കാണാം.',
    },
    accent: ACCENT.orange,
  },
];
