/**
 * Utilities to parse and sanitize release notes from GitHub / electron-updater.
 * Supports HTML (GitHub release payload), Markdown, plain text, and multi-version arrays.
 * Transforms raw release notes into rich "What's New" UI cards dynamically.
 */
import type { WhatsNewItem } from './whatsNew';

export interface ParsedReleaseItem {
  id: string;
  title?: string;
  description: string;
  isFix: boolean;
  isLink?: boolean;
  link?: { text: string; url: string };
  section?: string;
}

export const ACCENTS = [
  { dot: 'bg-emerald-500', tag: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:border-emerald-500/40 hover:bg-emerald-500/[0.02]' },
  { dot: 'bg-blue-500', tag: 'text-blue-600 dark:text-blue-400 bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', hover: 'hover:border-blue-500/40 hover:bg-blue-500/[0.02]' },
  { dot: 'bg-violet-500', tag: 'text-violet-600 dark:text-violet-400 bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', hover: 'hover:border-violet-500/40 hover:bg-violet-500/[0.02]' },
  { dot: 'bg-amber-500', tag: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', hover: 'hover:border-amber-500/40 hover:bg-amber-500/[0.02]' },
  { dot: 'bg-teal-500', tag: 'text-teal-600 dark:text-teal-400 bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', hover: 'hover:border-teal-500/40 hover:bg-teal-500/[0.02]' },
  { dot: 'bg-rose-500', tag: 'text-rose-600 dark:text-rose-400 bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', hover: 'hover:border-rose-500/40 hover:bg-rose-500/[0.02]' },
  { dot: 'bg-sky-500', tag: 'text-sky-600 dark:text-sky-400 bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', hover: 'hover:border-sky-500/40 hover:bg-sky-500/[0.02]' },
  { dot: 'bg-indigo-500', tag: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', hover: 'hover:border-indigo-500/40 hover:bg-indigo-500/[0.02]' },
  { dot: 'bg-orange-500', tag: 'text-orange-600 dark:text-orange-400 bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', hover: 'hover:border-orange-500/40 hover:bg-orange-500/[0.02]' },
];

export interface DynamicWhatsNewCard {
  id: string;
  title: { en: string; ml: string };
  tag: { en: string; ml: string };
  subtitle: string;
  text: { en: string; ml: string };
  accent: { dot: string; tag: string; text: string; hover: string };
  link?: { text: string; url: string };
  isFix: boolean;
  isLink?: boolean;
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripHtmlTags(str: string): string {
  return decodeHtmlEntities(str.replace(/<[^>]*>/g, '').trim());
}

export function capitalize(str: string): string {
  const trimmed = str.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const FIX_KEYWORDS = /\b(fix|fixes|fixed|bug|bugs|issue|issues|error|errors|resolved|patch|hotfix|revert)\b/i;
const LINK_KEYWORDS = /\b(changelog|compare|download|release|github|commit)\b/i;

export const SKIP_HEADINGS = /^(what's\s*new|release\s*notes|release\s*highlights|highlights|v?\d+\.\d+\.\d+.*)$/i;

export const INTERNAL_SECTIONS = /\b(verification|technical|build|internal|developer|ci|testing|test results|diagnostics|windows upgrade|upgrade note|upgrade recovery|checksums|sha-?256|release gate)\b/i;

export const INTERNAL_LINE_PATTERN = /\b(?:all\s+)?\d+\s+.*tests?\s+pass|tests?\s+pass(ed)?\b|\b\d+\s+test\s+files\b|\b\d+[\d,]*\s*ipc\s+calls\b|\barchitecture\s+guard\b|\blint:\s*zero\b|\blint\s*ratchet\b|\bdisposable\s*(?:windows\s*)?runner\b|\bwindows\s*acceptance\b|\bsource\s*ci\b|\bupdater\s*handoff\b|\binstaller\s*extraction\b|\bmatches\s+the\s+tested\s+build\b|\binstaller\s*sha-?256\b|\bsha-?512\b|\bsignature\s*status\b|\bnotsigned\b|\bsmart\s*app\s*control\b|\bpublisher\s*block\b|\btrusted\s*windows\s*signing\b|\bpr\s*#\d+\b|^source:\s*\[?pr\s*#\d+|^commit\s+[0-9a-f]{7,}|\bif\s+an\s+older\s+installer/i;

export function formatTitle(str: string): string {
  const cleaned = str.replace(/[:\-–—.,\s]+$/, '').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function cleanDescription(rawDesc: string, title?: string): string {
  let desc = rawDesc.trim();
  if (title) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^${escapedTitle}(?:\\s*[:\\-–—]\\s*|\\s+)`, 'i');
    desc = desc.replace(prefixRegex, '').trim();
  }
  return capitalize(desc);
}

export function isInternalContent(text: string, section?: string): boolean {
  if (section && INTERNAL_SECTIONS.test(section)) return true;
  return INTERNAL_LINE_PATTERN.test(text);
}

/**
 * Derives a concise, meaningful title from release note text when no explicit bold/colon title exists.
 */
export function deriveTitle(description: string): string {
  const clean = description.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!clean) return '';

  // 1. Text before explicit colon: "Cash Register: removes legacy duplicate..." -> "Cash Register"
  const colonMatch = clean.match(/^([A-Za-z0-9\s&()/-]{2,50}):\s+(.+)$/);
  if (colonMatch) {
    return formatTitle(colonMatch[1]);
  }

  // 2. Text before parenthetical detail: "Fixed right border not visible on 80mm rolls (was at 77mm...)"
  const parenMatch = clean.match(/^([^(]+?)\s*\(([^)]+)\)\.?$/);
  if (parenMatch) {
    const beforeParen = parenMatch[1].trim();
    if (beforeParen.length >= 8 && beforeParen.length <= 65) {
      return formatTitle(beforeParen);
    }
  }

  // 3. Text before dash or semicolon: "Print margin adjustment - reduced left padding"
  const delimMatch = clean.match(/^([^—–;]+?)\s*[—–;]\s*(.+)$/);
  if (delimMatch) {
    const beforeDelim = delimMatch[1].trim();
    if (beforeDelim.length >= 8 && beforeDelim.length <= 55) {
      return formatTitle(beforeDelim);
    }
  }

  // 4. Verb phrase / action prefix:
  // "Added support for custom barcode scanning" -> "Custom Barcode Scanning"
  const supportMatch = clean.match(/^(?:added\s+)?support\s+for\s+([^,.;]+)/i);
  if (supportMatch) {
    return formatTitle(`${supportMatch[1].trim()} Support`);
  }

  // 5. Action verb + object up to preposition (to, for, with, by, in, on, at, from):
  // "Re-calibrated font-size inner width calculation to match new padding geometry."
  const prepMatch = clean.match(/^([A-Za-z0-9-]+\s+[A-Za-z0-9-]+\s+[A-Za-z0-9-]+\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)\s+(?:to|for|with|by|in|on|at|from)\s+/i);
  if (prepMatch && prepMatch[1].length <= 55) {
    return formatTitle(prepMatch[1].trim());
  }

  // 6. Short sentence / clause (first 4-6 words, max 50 chars):
  const words = clean.split(/\s+/);
  if (words.length <= 6 && clean.length <= 50) {
    return formatTitle(clean.replace(/[.,;:]+$/, ''));
  }
  const firstWords = words.slice(0, 5).join(' ');
  return formatTitle(firstWords);
}

function extractLink(htmlOrText: string): { text: string; url: string } | undefined {
  // HTML link <a href="...">text</a>
  const htmlMatch = htmlOrText.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (htmlMatch) {
    const url = decodeHtmlEntities(htmlMatch[1].trim());
    const text = stripHtmlTags(htmlMatch[2]);
    return { text: text || url, url };
  }

  // Markdown link [text](url)
  const mdMatch = htmlOrText.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
  if (mdMatch) {
    return { text: mdMatch[1].trim(), url: mdMatch[2].trim() };
  }

  // Raw URL
  const rawUrlMatch = htmlOrText.match(/(https?:\/\/[^\s<"']+)/i);
  if (rawUrlMatch) {
    return { text: rawUrlMatch[1], url: rawUrlMatch[1] };
  }

  return undefined;
}

/**
 * Parses release notes string or array into structured release note items.
 */
export function parseReleaseNotes(rawNotes: unknown): ParsedReleaseItem[] {
  if (!rawNotes) return [];

  let text: string;
  if (typeof rawNotes === 'string') {
    text = rawNotes;
  } else if (Array.isArray(rawNotes)) {
    text = rawNotes
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'note' in entry && typeof entry.note === 'string') {
          return entry.note;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  } else {
    return [];
  }

  const trimmed = text.trim();
  if (!trimmed) return [];

  // Check if content has HTML tags
  const hasHtml = /<\/?(?:ul|ol|li|p|h[1-6]|div|span|strong|b|a|details|summary)\b/i.test(trimmed);

  if (hasHtml) {
    return parseHtmlReleaseNotes(trimmed);
  }

  return parseMarkdownReleaseNotes(trimmed);
}

function parseHtmlReleaseNotes(html: string): ParsedReleaseItem[] {
  const items: ParsedReleaseItem[] = [];
  let currentSection = '';

  // Look for standalone heading or paragraph before any list
  const beforeListMatch = html.split(/<[uo]l\b/i)[0] || '';
  const headerMatch = beforeListMatch.match(/<(?:p|h[1-6])\b[^>]*>([^<]+)<\/(?:p|h[1-6])>/i);
  if (headerMatch) {
    const text = stripHtmlTags(headerMatch[1]).trim();
    if (/^([A-Za-z0-9\s&()/-]{2,70}):?\s*$/.test(text) && !SKIP_HEADINGS.test(text) && !LINK_KEYWORDS.test(text)) {
      currentSection = text.replace(/[:\s]+$/, '').trim();
    }
  }

  if (INTERNAL_SECTIONS.test(currentSection)) {
    return [];
  }

  // Remove <details>...</details> blocks entirely from HTML
  const cleanedHtml = html.replace(/<details\b[\s\S]*?<\/details>/gi, '');

  // Extract all <li>...</li> items
  const liMatches = [...cleanedHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  for (let i = 0; i < liMatches.length; i++) {
    const rawInner = liMatches[i][1].trim();
    if (!rawInner) continue;
    const stripped = stripHtmlTags(rawInner);
    if (isInternalContent(stripped, currentSection)) continue;

    const parsed = parseSingleHtmlBlock(rawInner, `li-${i}`, currentSection);
    if (parsed) items.push(parsed);
  }

  // Also check for standalone paragraphs like <p><strong>Download:</strong> <a href="...">...</a></p>
  const pMatches = [...cleanedHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  for (let i = 0; i < pMatches.length; i++) {
    const rawInner = pMatches[i][1].trim();
    if (!rawInner) continue;

    // Skip if it contains or is an <ul> or <li>
    if (/<(?:ul|ol|li)\b/i.test(rawInner)) continue;

    const stripped = stripHtmlTags(rawInner);
    if (SKIP_HEADINGS.test(stripped)) continue;
    if (isInternalContent(stripped, currentSection)) continue;

    // Standalone section heading ending in colon
    if (/^([A-Za-z0-9\s&()/-]{2,70}):\s*$/.test(stripped) && !extractLink(rawInner)) {
      currentSection = stripped.replace(/[:\s]+$/, '').trim();
      continue;
    }

    const hasLink = /<a\b/i.test(rawInner);
    const hasStrong = /<(?:strong|b)\b/i.test(rawInner);
    // If we already parsed <li> items and this <p> has no links or bold titles, it is intro or status text
    if (!hasLink && !hasStrong && liMatches.length > 0) {
      continue;
    }

    const parsed = parseSingleHtmlBlock(rawInner, `p-${i}`, currentSection);
    if (parsed && !items.some((it) => it.title === parsed.title && it.description === parsed.description)) {
      items.push(parsed);
    }
  }

  return items;
}

function parseSingleHtmlBlock(innerHtml: string, fallbackId: string, section?: string): ParsedReleaseItem | null {
  if (section && INTERNAL_SECTIONS.test(section)) return null;

  // Check for strong/b tag for title
  const strongMatch = innerHtml.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
  let title: string | undefined;
  let remainingHtml = innerHtml;

  if (strongMatch) {
    const rawTitle = stripHtmlTags(strongMatch[1]).replace(/[:\-–—\s]+$/, '').trim();
    if (rawTitle && !SKIP_HEADINGS.test(rawTitle)) {
      title = formatTitle(rawTitle);
      remainingHtml = innerHtml.replace(strongMatch[0], '');
    }
  }

  // If no strong/b, check for explicit delimiter "Title: Description" or "Title - Description"
  if (!title) {
    const strippedText = stripHtmlTags(innerHtml).trim();
    const delimMatch = strippedText.match(/^([A-Za-z0-9\s&()/-]{2,50})(?::\s*|\s+[-–—]\s+)(.+)$/);
    if (delimMatch) {
      title = formatTitle(delimMatch[1]);
      remainingHtml = delimMatch[2];
    }
  }

  const link = extractLink(innerHtml);
  const rawDescription = stripHtmlTags(remainingHtml).replace(/^[:\-–—\s]+/, '').trim();

  // If both title and description are empty, skip
  if (!title && !rawDescription && !link) return null;

  const desc = cleanDescription(rawDescription || (link ? link.text : title || ''), title);
  if (SKIP_HEADINGS.test(desc) && !title && !link) return null;
  if (isInternalContent(desc, section) || isInternalContent(innerHtml, section)) return null;

  const combinedText = `${section || ''} ${title || ''} ${desc}`;
  const isFix = FIX_KEYWORDS.test(combinedText);
  const isLink = Boolean(link) || LINK_KEYWORDS.test(title || '');

  return {
    id: fallbackId,
    title,
    description: desc,
    isFix,
    isLink,
    link,
    section,
  };
}

function parseMarkdownReleaseNotes(text: string): ParsedReleaseItem[] {
  const items: ParsedReleaseItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let counter = 0;
  let currentSection = '';
  let inDetailsBlock = false;

  for (const line of lines) {
    // Check for <details> / </details> blocks
    if (/<details\b/i.test(line)) {
      inDetailsBlock = true;
      continue;
    }
    if (/<\/details>/i.test(line)) {
      inDetailsBlock = false;
      continue;
    }
    if (inDetailsBlock) continue;

    // Skip markdown headings like ## What's New
    if (/^#{1,6}\s+/.test(line)) {
      const headingText = line.replace(/^#{1,6}\s+/, '').trim();
      currentSection = headingText.replace(/[:\s]+$/, '').trim();
      continue;
    }

    // Skip horizontal dividers
    if (/^[-*_]{3,}$/.test(line)) continue;

    // If we are in an internal section, skip all lines until next section
    if (INTERNAL_SECTIONS.test(currentSection)) continue;

    // Check if standalone section header ending in colon without bullet
    if (!/^[-*•\d.]+\s*/.test(line) && /^([A-Za-z0-9\s&()/-]{2,70}):\s*$/.test(line)) {
      currentSection = line.replace(/[:\s]+$/, '').trim();
      continue;
    }

    // Clean bullet markers safely
    const cleaned = line.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!cleaned || SKIP_HEADINGS.test(cleaned)) continue;
    if (isInternalContent(cleaned, currentSection)) continue;

    // Check if bullet itself is just a header ending in colon
    if (/^([A-Za-z0-9\s&()/-]{2,70}):\s*$/.test(cleaned)) {
      currentSection = cleaned.replace(/[:\s]+$/, '').trim();
      continue;
    }

    let title: string | undefined;
    let desc = cleaned;

    // Check for **Title**: or __Title__: or Title:
    const titleMatch = cleaned.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__|([A-Za-z0-9\s&()/-]+?))(?::\s*|\s+[-–—]\s+|\s*[–—]\s*)(.*)$/);
    if (titleMatch) {
      const candidateTitle = (titleMatch[1] || titleMatch[2] || titleMatch[3] || '').trim();
      const candidateDesc = (titleMatch[4] || '').trim();
      if (candidateTitle.length >= 3 && candidateTitle.length < 50 && candidateDesc.length > 0) {
        title = formatTitle(candidateTitle);
        desc = candidateDesc;
      }
    }

    desc = cleanDescription(desc, title);
    if (isInternalContent(desc, currentSection)) continue;

    const link = extractLink(desc) || extractLink(cleaned);
    const combinedText = `${currentSection} ${title || ''} ${desc}`;
    const isFix = FIX_KEYWORDS.test(combinedText);
    const isLink = Boolean(link) || LINK_KEYWORDS.test(title || '');

    items.push({
      id: `item-${counter++}`,
      title,
      description: desc,
      isFix,
      isLink,
      link,
      section: currentSection,
    });
  }

  return items;
}

/**
 * Returns a clean, concise single-line highlight for the update banner.
 */
export function getReleaseNotesSummary(rawNotes: unknown): string {
  const items = parseReleaseNotes(rawNotes);
  if (items.length > 0) {
    const first = items[0];
    const derivedTitle = first.title || deriveTitle(first.description);
    if (derivedTitle && first.description && derivedTitle !== first.description) {
      return `${derivedTitle}: ${first.description}`;
    }
    return derivedTitle || first.description;
  }
  return 'New features and improvements';
}

/**
 * Infers a category tag in English and Malayalam from item content.
 */
export function inferItemTag(title?: string, description?: string, sectionContext?: string): { en: string; ml: string } {
  const combined = `${sectionContext || ''} ${title || ''} ${description || ''}`.toLowerCase();

  if (/\b(changelog|compare|download|release|github|commit)\b/i.test(combined)) {
    return { en: 'Resource', ml: 'വിവരങ്ങൾ' };
  }
  // Staff & Attendance & Payroll
  if (/\b(staff|attendance|payroll|salary|wage|wages|advance|payout|employee|timesheet)\b/i.test(combined)) {
    return { en: 'Staff', ml: 'ജീവനക്കാർ' };
  }
  // Day closing / shop closing
  if (/\b(shop\s*closing|day\s*end|daily\s*closing|shift\s*closing|gross\s*sales)\b/i.test(combined)) {
    return { en: 'Closing', ml: 'ക്ലോസിംഗ്' };
  }
  // Printing (before billing so thermal tax receipt gets Printing)
  if (/\b(print|printing|printed|printer|thermal|receipt|paper|cutter|tax\s*receipt|roll|rolls|margin|padding|layout|font-size|alignment|geometry)\b/i.test(combined)) {
    return { en: 'Printing', ml: 'പ്രിന്റിംഗ്' };
  }
  // Security & Authentication
  if (/\b(sign-?in|login|switch\s*user|remember.*shop|password|credential|pin)\b/i.test(combined)) {
    return { en: 'Security', ml: 'സെക്യൂരിറ്റി' };
  }
  // Sharing & WhatsApp
  if (/\b(whatsapp|share\s+the\s+checkout|export\s*bill)\b/i.test(combined)) {
    return { en: 'Sharing', ml: 'ഷെയറിംഗ്' };
  }
  // Explicit inventory / tiers
  if (/\b(inventory|pricing\s*tier|add\s*tier|stock\s*count)\b/i.test(combined)) {
    return { en: 'Inventory', ml: 'ഇൻവെന്ററി' };
  }
  // Bug fixes & Improvements
  if (FIX_KEYWORDS.test(combined)) {
    return { en: 'Improvement', ml: 'മെച്ചപ്പെടുത്തൽ' };
  }
  // Hardware / Cash Drawer
  if (/\b(drawer|cash\s*drawer|register|cash\s*register|hardware|scale|scanner)\b/i.test(combined)) {
    return { en: 'Hardware', ml: 'ഹാർഡ്‌വെയർ' };
  }
  // Checkout & Net pay
  if (/\b(total|net\s*pay|discount|roundoff|grand\s*total|checkout|tender)\b/i.test(combined)) {
    return { en: 'Checkout', ml: 'ചെക്ക്ഔട്ട്' };
  }
  // General Billing & Pricing
  if (/\b(unit|units|pricing|product|cart|tax|gst|inclusive|exclusive|barcode|item|filing)\b/i.test(combined)) {
    return { en: 'Billing', ml: 'ബില്ലിംഗ്' };
  }
  // Sync
  if (/\b(sync|cloud|backup|network|offline|lan|pairing)\b/i.test(combined)) {
    return { en: 'Sync', ml: 'സിങ്ക്' };
  }
  // Customers & Ledger
  if (/\b(customer|credit|ledger|party|balance)\b/i.test(combined)) {
    return { en: 'Customers', ml: 'കസ്റ്റമേഴ്സ്' };
  }
  // Settings
  if (/\b(preference|settings|config)\b/i.test(combined)) {
    return { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' };
  }
  return { en: 'New Feature', ml: 'പുതിയ ഫീച്ചർ' };
}

export const MALAYALAM_TITLE_MAP: Record<string, string> = {
  'cash register': 'ക്യാഷ് രജിസ്റ്റർ',
  'shop closing': 'കട അടയ്ക്കൽ & ഗ്രോസ് സെയിൽസ്',
  'gross sales': 'കട അടയ്ക്കൽ & ഗ്രോസ് സെയിൽസ്',
  'whatsapp bills and pdfs': 'വാട്ട്‌സ്ആപ്പ് & പിഡിഎഫ് ബില്ലുകൾ',
  'whatsapp & pdf sharing': 'വാട്ട്‌സ്ആപ്പ് & പിഡിഎഫ് ബില്ലുകൾ',
  'whatsapp': 'വാട്ട്‌സ്ആപ്പ് ബില്ലുകൾ',
  'staff': 'ജീവനക്കാരുടെ ഹാജരും ശമ്പളവും',
  'staff attendance': 'ജീവനക്കാരുടെ ഹാജരും ശമ്പളവും',
  'inventory': 'സ്റ്റോക്കും വില വിവരങ്ങളും',
  'pricing tiers': 'സ്റ്റോക്കും വില വിവരങ്ങളും',
  'sign-in': 'ലളിതമായ ലോഗിൻ വിവരങ്ങൾ',
  'quick shop sign-in': 'ലളിതമായ ലോഗിൻ വിവരങ്ങൾ',
  'clean thermal tax receipts': 'തെർമൽ ടാക്സ് രസീതുകൾ',
  'quick product units & pricing': 'യൂണിറ്റുകളും വിലയും',
  'offline-first security & sync': 'ഓഫ്‌ലൈൻ ബാക്കപ്പും സിങ്കും',
  'automated system updates': 'ഓട്ടോമാറ്റിക് സിസ്റ്റം അപ്ഡേറ്റുകൾ',
  'fast retail & gst billing': 'വേഗതയേറിയ ജിഎസ്ടി ബില്ലിംഗ്',
};

/**
 * Converts dynamic release notes into rich "What's New" cards matching the design system.
 */
export function releaseNotesToCards(rawNotes: unknown, staticItems?: WhatsNewItem[]): DynamicWhatsNewCard[] {
  const items = parseReleaseNotes(rawNotes);
  return items.map((item, index) => {
    const accent = ACCENTS[index % ACCENTS.length];
    const derived = item.title || deriveTitle(item.description);
    const titleEn = derived || (item.link ? item.link.text : 'Improvement');
    const descEn = cleanDescription(item.description || (item.link ? item.link.url : ''), titleEn);
    const inferredTag = inferItemTag(titleEn, descEn, item.section);

    // Check if a static item matches to borrow high-quality Malayalam translations
    const matched = staticItems?.find(
      (s) => s.title.en.toLowerCase() === titleEn.toLowerCase()
    );

    const mlLookupKey = titleEn.toLowerCase();
    const mlMappedTitle = MALAYALAM_TITLE_MAP[mlLookupKey] ||
      Object.entries(MALAYALAM_TITLE_MAP).find(([k]) => mlLookupKey.includes(k))?.[1];

    const title = {
      en: titleEn,
      ml: matched ? matched.title.ml : (mlMappedTitle || titleEn),
    };

    const tag = matched ? matched.tag : inferredTag;

    const firstSentence = descEn.split(/(?<=[.!?])\s+/)[0] || '';
    const subtitle = matched
      ? matched.subtitle
      : (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 80 && firstSentence !== descEn
          ? firstSentence
          : '');

    const text = {
      en: descEn,
      ml: matched ? matched.text.ml : descEn,
    };

    return {
      id: item.id || `dyn-card-${index}`,
      title,
      tag,
      subtitle,
      text,
      accent,
      link: item.link,
      isFix: item.isFix,
      isLink: item.isLink,
    };
  });
}
