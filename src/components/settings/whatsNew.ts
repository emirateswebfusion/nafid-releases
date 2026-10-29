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
    title: { en: 'Quick Product Entry', ml: 'വേഗത്തിൽ പ്രൊഡക്റ്റുകൾ ചേർക്കാം' },
    tag: { en: 'Billing', ml: 'ബില്ലിംഗ്' },
    subtitle: 'Add multiple items in one fast table',
    text: {
      en: 'Add several new products together using an easy spreadsheet-style table right from the billing screen, saving time during new stock arrivals.',
      ml: 'ബില്ലിംഗ് സ്ക്രീനിൽ നിന്ന് തന്നെ ഒന്നിലധികം പുതിയ പ്രൊഡക്റ്റുകൾ ഒന്നിച്ച് എളുപ്പത്തിൽ ടേബിളിൽ ടൈപ്പ് ചെയ്ത് ചേർക്കാം. സാധനങ്ങൾ സ്റ്റോക്കിൽ കയറ്റുമ്പോൾ സമയം ലാഭിക്കാം.',
    },
    accent: ACCENT.emerald,
  },
  {
    title: { en: 'Converted Bills Filter', ml: 'മാറ്റിയ ബില്ലുകൾ പ്രത്യേകം കാണാം' },
    tag: { en: 'Sales History', ml: 'സെയിൽസ് ഹിസ്റ്ററി' },
    subtitle: 'Quickly view bills changed from counter to GST',
    text: {
      en: 'Find all bills converted from regular counter bills to GST invoices with one click using the new "Converted from BOS" filter in Sales History.',
      ml: 'സാധാരണ ബില്ലിൽ നിന്ന് GST ആക്കി മാറ്റിയ എല്ലാ ബില്ലുകളും സെയിൽസ് ഹിസ്റ്ററിയിൽ ഒറ്റ ക്ലിക്കിൽ എടുത്തു കാണാൻ പുതിയ ഫിൽട്ടർ.',
    },
    accent: ACCENT.blue,
  },
  {
    title: { en: 'Accurate Shop Time', ml: 'കൃത്യമായ ഷോപ്പ് സമയം' },
    tag: { en: 'Reports', ml: 'റിപ്പോർട്ടുകൾ' },
    subtitle: 'Sales and closing reports match your business day',
    text: {
      en: "Your daily sales, shift summaries and closing reports strictly follow your shop's official business hours and local time for clean day-end tallies.",
      ml: 'നിങ്ങളുടെ പ്രതിദിന സെയിൽസും ക്ലോസിംഗ് റിപ്പോർട്ടുകളും ഷോപ്പിലെ യഥാർത്ഥ സമയക്രമം അനുസരിച്ച് കൃത്യമായി കണക്കാക്കപ്പെടുന്നു.',
    },
    accent: ACCENT.amber,
  },
  {
    title: { en: 'Smooth Customer Sync', ml: 'സുരക്ഷിതമായ കസ്റ്റമർ വിവരങ്ങൾ' },
    tag: { en: 'Sync', ml: 'സിങ്ക്' },
    subtitle: 'Points and customer profiles merge cleanly',
    text: {
      en: 'Customer profiles and reward points synchronize smoothly between counters and cloud without creating duplicate profiles or missing points.',
      ml: 'വിവിധ കൗണ്ടറുകൾ തമ്മിൽ കസ്റ്റമർ വിവരങ്ങളും പോയിന്റുകളും സിങ്ക് ചെയ്യുമ്പോൾ പേരുകൾ ഇരട്ടിക്കാതിരിക്കാനും പോയിന്റുകൾ നഷ്ടപ്പെടാതിരിക്കാനും കൂടുതൽ സുരക്ഷിതമാക്കി.',
    },
    accent: ACCENT.teal,
  },
  {
    title: { en: 'Flexible Tax Filing', ml: 'കൂടുതൽ എളുപ്പമുള്ള ഫയലിംഗ്' },
    tag: { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' },
    subtitle: 'Choose how B2B and B2C filing bills appear',
    text: {
      en: 'Independent settings for B2B and B2C tax filing bills give you complete control over how filing-only bills display in your sales views.',
      ml: 'ടാക്സ് ഫയലിംഗിന് മാത്രമായുള്ള B2B, B2C ബില്ലുകൾ സെയിൽസിൽ എങ്ങനെ കാണിക്കണമെന്ന് സെറ്റിംഗ്സിൽ നിങ്ങളുടെ ഇഷ്ടാനുസരണം തിരഞ്ഞെടുക്കാം.',
    },
    accent: ACCENT.violet,
  },
];
