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
    title: { en: 'Simpler Settings & Search', ml: 'എളുപ്പമുള്ള സെറ്റിംഗ്സും സെർച്ചും' },
    tag: { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' },
    subtitle: 'Find any option quickly with sidebar search',
    text: {
      en: 'Settings are now neatly organized into separate pages with a search bar. Type what you need to jump directly to any option without scrolling.',
      ml: 'സെറ്റിംഗ്സുകൾ ഇപ്പോൾ ഓരോ പ്രത്യേക പേജുകളിലായി ക്രമീകരിച്ചിരിക്കുന്നു. ആവശ്യമുള്ള ഓപ്ഷൻ എളുപ്പത്തിൽ കണ്ടെത്താൻ സെർച്ച് ബാറും നൽകിയിട്ടുണ്ട്.',
    },
    accent: ACCENT.emerald,
  },
  {
    title: { en: 'Exact Credit Balances', ml: 'കൃത്യമായ കടം കണക്കുകൾ' },
    tag: { en: 'Credit', ml: 'കടം' },
    subtitle: 'Customer & supplier balances stay true',
    text: {
      en: 'Customer and supplier balances stay exact after edits, payments and returns. Outstanding bills are automatically settled in order, so you always see who owes what.',
      ml: 'ബിൽ മാറ്റങ്ങൾ വരുത്തുമ്പോഴും പണം സ്വീകരിക്കുമ്പോഴും കസ്റ്റമർ, സപ്ലയർ ബാലൻസുകൾ കൃത്യമായിരിക്കും. പഴയ ബാക്കി തുകകൾ ക്രമമായി തനിയെ കുറയും.',
    },
    accent: ACCENT.blue,
  },
  {
    title: { en: 'Fast WhatsApp QR', ml: 'വേഗത്തിലുള്ള വാട്സാപ്പ് കണക്ഷൻ' },
    tag: { en: 'WhatsApp', ml: 'വാട്സാപ്പ്' },
    subtitle: 'QR code opens immediately without delay',
    text: {
      en: 'The WhatsApp QR code now loads instantly when connecting. Connection status and errors are clearly shown in Settings.',
      ml: 'വാട്സാപ്പ് കണക്ട് ചെയ്യുമ്പോൾ QR കോഡ് ഇനി ഒട്ടും വൈകാതെ തെളിയും. കണക്ഷൻ വിവരങ്ങൾ സെറ്റിംഗ്സിൽ വ്യക്തമായി കാണാം.',
    },
    accent: ACCENT.teal,
  },
  {
    title: { en: 'Smooth Receipt Printing', ml: 'തടസ്സമില്ലാത്ത രസീത് പ്രിന്റിംഗ്' },
    tag: { en: 'Printing', ml: 'പ്രിന്റിംഗ്' },
    subtitle: 'No duplicate receipts or printer freezing',
    text: {
      en: 'Receipts print immediately without unexpected double-printing or system pauses, even during peak rush hours.',
      ml: 'തിരക്കുള്ള സമയങ്ങളിലും രസീതുകൾ രണ്ടുതവണ പ്രിന്റാവാതെയും സിസ്റ്റം നിന്നുപോവാതെയും വേഗത്തിൽ പ്രിന്റ് ചെയ്യും.',
    },
    accent: ACCENT.sky,
  },
  {
    title: { en: 'Sequential GST Numbers', ml: 'തുടർച്ചയായ GST നമ്പറുകൾ' },
    tag: { en: 'Billing', ml: 'ബില്ലിംഗ്' },
    subtitle: 'No missing or skipped invoice numbers',
    text: {
      en: 'Converting counter bills to GST now only reserves invoice numbers when the bill is saved, keeping your tax bill numbers in continuous order.',
      ml: 'സാധാരണ ബില്ലുകൾ GST ആക്കി മാറ്റുമ്പോൾ നമ്പറുകൾ ഒന്നും പാഴാവാതെ കൃത്യമായ ക്രമത്തിൽ തന്നെ ലഭിക്കും.',
    },
    accent: ACCENT.amber,
  },
  {
    title: { en: 'Safe Contact Edits', ml: 'സുരക്ഷിതമായ കോൺടാക്റ്റ് വിവരങ്ങൾ' },
    tag: { en: 'Customers', ml: 'കസ്റ്റമേഴ്സ്' },
    subtitle: 'Phone number changes are never overwritten',
    text: {
      en: 'Updated customer and supplier phone numbers are protected from being overwritten, ensuring your contact directory is always up to date.',
      ml: 'കസ്റ്റമർമാരുടെയും സപ്ലയർമാരുടെയും പുതിയ ഫോൺ നമ്പറുകൾ പഴയ വിവരങ്ങൾ വന്ന് മാഞ്ഞുപോകാതെ സുരക്ഷിതമായി സൂക്ഷിക്കും.',
    },
    accent: ACCENT.violet,
  },
];
