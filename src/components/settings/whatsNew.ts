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
    title: { en: 'Clean Thermal Tax Receipts', ml: 'വൃത്തിയുള്ള തെർമൽ ടാക്സ് ബില്ലുകൾ' },
    tag: { en: 'Printing', ml: 'പ്രിന്റിംഗ്' },
    subtitle: 'Clear CGST, SGST and Taxable totals on printed receipts',
    text: {
      en: 'Printed receipts on thermal printers now feature a clean, uncluttered GST breakdown with clear Taxable, CGST, SGST, and total amounts tailored for retail billing.',
      ml: 'തെർമൽ പ്രിന്ററുകളിൽ വരുന്ന ബില്ലുകളിൽ ടാക്സബിൾ തുകയും CGST, SGST എന്നിവയും കൂടുതൽ വ്യക്തമായും ഭംഗിയായും കാണാം.',
    },
    accent: ACCENT.emerald,
  },
  {
    title: { en: 'Quick Product Units & Pricing', ml: 'പ്രൊഡക്റ്റ് യൂണിറ്റും വിലയും എളുപ്പത്തിൽ' },
    tag: { en: 'Billing', ml: 'ബില്ലിംഗ്' },
    subtitle: 'Pick units and tax types directly while adding items',
    text: {
      en: 'Select product units (pieces, kg, litres) and choose whether prices include or exclude tax directly from the Quick Product Entry table before saving.',
      ml: 'വേഗത്തിൽ പ്രൊഡക്റ്റുകൾ ചേർക്കുമ്പോൾ തന്നെ യൂണിറ്റും (പീസ്, കിലോ, ലിറ്റർ) നികുതി ഉൾപ്പെടെയുള്ള വിലയാണോ എന്നും ടേബിളിൽ നിന്ന് തന്നെ തിരഞ്ഞെടുക്കാം.',
    },
    accent: ACCENT.blue,
  },
  {
    title: { en: 'Streamlined Filing-Only Mode', ml: 'ടാക്സ് ഫയലിംഗ് ക്രമീകരണങ്ങൾ' },
    tag: { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' },
    subtitle: 'Better control over filing bills in drawer and sales',
    text: {
      en: 'Easily choose whether filing-only bills count towards your daily drawer collection and sales today, keeping your accountant filing separate from cash on hand.',
      ml: 'ഫയലിംഗ് മാത്രമായുള്ള ബില്ലുകൾ ദിവസേനയുള്ള ഡ്രോയർ കണക്കിലും ഇന്നത്തെ വരുമാനത്തിലും ഉൾപ്പെടുത്തണോ എന്ന് ഒറ്റ ക്ലിക്കിൽ നിയന്ത്രിക്കാം.',
    },
    accent: ACCENT.violet,
  },
  {
    title: { en: 'Cash Register & Drawer Controls', ml: 'ക്യാഷ് ഡ്രോയറും രജിസ്റ്ററും' },
    tag: { en: 'Hardware', ml: 'ഹാർഡ്‌വെയർ' },
    subtitle: 'Quick toggles for drawer opening and register workflow',
    text: {
      en: 'Configure automatic cash drawer opening and cash register preferences directly with intuitive toggles for faster checkout and shift closing.',
      ml: 'ബില്ലിംഗ് സമയത്ത് ക്യാഷ് ഡ്രോയർ ഓട്ടോമാറ്റിക് ആയി തുറക്കുന്നതും രജിസ്റ്റർ സെറ്റിംഗ്സുകളും പുതിയ സ്വിച്ചുകളിലൂടെ എളുപ്പത്തിൽ ക്രമീകരിക്കാം.',
    },
    accent: ACCENT.amber,
  },
  {
    title: { en: 'Accurate Bill Totals & Net Pay', ml: 'കൃത്യമായ നെറ്റ് ടോട്ടൽ' },
    tag: { en: 'Checkout', ml: 'ചെക്ക്ഔട്ട്' },
    subtitle: 'Clear final payable amount and roundoff',
    text: {
      en: 'Clear distinction between Grand Total and Net Total on printouts and screens whenever discounts or roundoffs are applied, making the final payment clear to customers.',
      ml: 'ഡിസ്കൗണ്ടുകളോ റൗണ്ട് ഓഫുകളോ ഉള്ളപ്പോൾ കസ്റ്റമർ നൽകേണ്ട കൃത്യമായ നെറ്റ് തുക ബില്ലിൽ കൂടുതൽ വ്യക്തമായി കാണിക്കുന്നു.',
    },
    accent: ACCENT.teal,
  },
];
