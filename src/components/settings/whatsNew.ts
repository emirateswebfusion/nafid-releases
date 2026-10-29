/**
 * Dynamic "What's New in Nafid" card system shown in Settings → Appearance & System Updates.
 *
 * ARCHITECTURE RULE:
 * Never hardcode release-specific highlights (e.g. per-version features) into static arrays.
 * Highlights are sourced dynamically from GitHub Releases / electron-updater payload (`updateInfo.releaseNotes`),
 * parsed into rich cards by `releaseNotesToCards()`, and cached in localStorage.
 */
import { releaseNotesToCards, ACCENTS, type DynamicWhatsNewCard } from './releaseNotesUtils';

export interface WhatsNewItem {
  title: { en: string; ml: string };
  tag: { en: string; ml: string };
  /** One-line English summary shown under the Malayalam title. */
  subtitle: string;
  text: { en: string; ml: string };
  accent: { dot: string; tag: string; text: string; hover: string };
  link?: { text: string; url: string };
}

export const ACCENT = {
  emerald: ACCENTS[0],
  blue: ACCENTS[1],
  violet: ACCENTS[2],
  amber: ACCENTS[3],
  teal: ACCENTS[4],
  rose: ACCENTS[5],
  sky: ACCENTS[6],
  indigo: ACCENTS[7],
  orange: ACCENTS[8],
};

/**
 * Evergreen fallback highlights displayed only when offline on a fresh install
 * before any update check has been performed.
 */
export const DEFAULT_WHATS_NEW: WhatsNewItem[] = [
  {
    title: { en: 'Automated System Updates', ml: 'ഓട്ടോമാറ്റിക് സിസ്റ്റം അപ്ഡേറ്റുകൾ' },
    tag: { en: 'System', ml: 'സിസ്റ്റം' },
    subtitle: 'Silent differential updates and automatic release notes',
    text: {
      en: 'Nafid POS checks for updates automatically in the background, applying performance improvements and features without disrupting daily billing.',
      ml: 'ദിവസേനയുള്ള ബില്ലിംഗിനെ ബാധിക്കാതെ തന്നെ പുതിയ ഫീച്ചറുകളും മെച്ചപ്പെടുത്തലുകളും ആപ്പിലേക്ക് തനിയെ ഡൗൺലോഡ് ചെയ്യപ്പെടുന്നു.',
    },
    accent: ACCENT.emerald,
  },
  {
    title: { en: 'Fast Retail & GST Billing', ml: 'വേഗതയേറിയ ജിഎസ്ടി ബില്ലിംഗ്' },
    tag: { en: 'Billing', ml: 'ബില്ലിംഗ്' },
    subtitle: 'Keyboard shortcuts, barcode scanning and instant thermal printing',
    text: {
      en: 'High-speed checkout with keyboard-driven workflows, multi-unit support, and clean thermal tax invoice printing.',
      ml: 'കീബോർഡ് ഷോർട്ട്കട്ടുകൾ, ബാർകോഡ് സ്കാനിംഗ്, തെർമൽ പ്രിന്റിംഗ് എന്നിവ വഴി മിന്നൽ വേഗത്തിൽ കസ്റ്റമർ ബില്ലുകൾ തയ്യാറാക്കാം.',
    },
    accent: ACCENT.blue,
  },
  {
    title: { en: 'Offline-First Security & Sync', ml: 'ഓഫ്‌ലൈൻ ബാക്കപ്പും സിങ്കും' },
    tag: { en: 'Sync', ml: 'സിങ്ക്' },
    subtitle: 'Local SQLite reliability with automatic cloud synchronization',
    text: {
      en: 'Your store runs 100% locally even without internet, synchronizing transactions to the cloud whenever connectivity is available.',
      ml: 'ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും കടയിലെ ബില്ലിംഗ് പൂർണ്ണ സുരക്ഷിതമായി നടക്കും; നെറ്റ് വരുമ്പോൾ ഡാറ്റ തനിയെ ക്ലൗഡിലേക്ക് സിങ്ക് ആകും.',
    },
    accent: ACCENT.violet,
  },
];

/** Backward compatibility alias. */
export const WHATS_NEW: WhatsNewItem[] = DEFAULT_WHATS_NEW;

/**
 * Resolves What's New cards dynamically:
 * 1. Active release notes from updateInfo
 * 2. Cached release notes for appVersion from localStorage
 * 3. Most recent cached release notes
 * 4. Evergreen baseline fallback
 */
export function getWhatsNewItems(releaseNotes?: string | null, appVersion?: string): WhatsNewItem[] {
  if (releaseNotes) {
    const cards = releaseNotesToCards(releaseNotes);
    if (cards.length > 0) return cards;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const cached =
        (appVersion ? localStorage.getItem(`nafid_release_notes_${appVersion}`) : null) ||
        localStorage.getItem('nafid_cached_release_notes');
      if (cached) {
        const cards = releaseNotesToCards(cached);
        if (cards.length > 0) return cards;
      }
    }
  } catch (_) {
    /* ignore storage errors */
  }

  return DEFAULT_WHATS_NEW;
}

export type { DynamicWhatsNewCard };
