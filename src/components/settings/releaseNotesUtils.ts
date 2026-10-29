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

const FIX_KEYWORDS = /\b(fix|fixes|fixed|bug|bugs|issue|issues|error|errors|resolved|patch|hotfix|revert)\b/i;
const LINK_KEYWORDS = /\b(changelog|compare|download|release|github|commit)\b/i;
const SKIP_HEADINGS = /^(what's\s*new|release\s*notes|release\s*highlights|highlights|v?\d+\.\d+\.\d+.*)$/i;

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
  const hasHtml = /<\/?(?:ul|ol|li|p|h[1-6]|div|span|strong|b|a)\b/i.test(trimmed);

  if (hasHtml) {
    return parseHtmlReleaseNotes(trimmed);
  }

  return parseMarkdownReleaseNotes(trimmed);
}

function parseHtmlReleaseNotes(html: string): ParsedReleaseItem[] {
  const items: ParsedReleaseItem[] = [];

  // Extract all <li>...</li> items
  const liMatches = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  for (let i = 0; i < liMatches.length; i++) {
    const rawInner = liMatches[i][1].trim();
    if (!rawInner) continue;

    const parsed = parseSingleHtmlBlock(rawInner, `li-${i}`);
    if (parsed) items.push(parsed);
  }

  // Also check for standalone paragraphs like <p><strong>Download:</strong> <a href="...">...</a></p>
  const pMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  for (let i = 0; i < pMatches.length; i++) {
    const rawInner = pMatches[i][1].trim();
    if (!rawInner) continue;

    // Skip if it contains or is an <ul> or <li>
    if (/<(?:ul|ol|li)\b/i.test(rawInner)) continue;

    const parsed = parseSingleHtmlBlock(rawInner, `p-${i}`);
    if (parsed && !items.some((it) => it.title === parsed.title && it.description === parsed.description)) {
      items.push(parsed);
    }
  }

  return items;
}

function parseSingleHtmlBlock(innerHtml: string, fallbackId: string): ParsedReleaseItem | null {
  // Check for strong/b tag for title
  const strongMatch = innerHtml.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
  let title: string | undefined;
  let remainingHtml = innerHtml;

  if (strongMatch) {
    const rawTitle = stripHtmlTags(strongMatch[1]).replace(/[:\-–—\s]+$/, '').trim();
    if (rawTitle && !SKIP_HEADINGS.test(rawTitle)) {
      title = rawTitle;
      remainingHtml = innerHtml.replace(strongMatch[0], '');
    }
  }

  const link = extractLink(innerHtml);
  const cleanDescription = stripHtmlTags(remainingHtml).replace(/^[:\-–—\s]+/, '').trim();

  // If both title and description are empty, skip
  if (!title && !cleanDescription && !link) return null;

  const desc = cleanDescription || (link ? link.text : title || '');
  if (SKIP_HEADINGS.test(desc) && !title && !link) return null;

  const combinedText = `${title || ''} ${desc}`;
  const isFix = FIX_KEYWORDS.test(combinedText);
  const isLink = Boolean(link) || LINK_KEYWORDS.test(title || '');

  return {
    id: fallbackId,
    title,
    description: desc,
    isFix,
    isLink,
    link,
  };
}

function parseMarkdownReleaseNotes(text: string): ParsedReleaseItem[] {
  const items: ParsedReleaseItem[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let counter = 0;
  for (const line of lines) {
    // Skip markdown headings like ## What's New
    if (/^#{1,6}\s+/.test(line)) {
      const headingText = line.replace(/^#{1,6}\s+/, '').trim();
      if (SKIP_HEADINGS.test(headingText)) continue;
    }

    // Skip horizontal dividers
    if (/^[-*_]{3,}$/.test(line)) continue;

    // Clean bullet markers
    const cleaned = line.replace(/^[-*•\d.]+\s*/, '').trim();
    if (!cleaned || SKIP_HEADINGS.test(cleaned)) continue;

    let title: string | undefined;
    let desc = cleaned;

    // Check for **Title**: or __Title__: or Title:
    const titleMatch = cleaned.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__|([A-Za-z0-9\s&()/-]+?))(?::\s*|\s*[-–—]\s*)(.*)$/);
    if (titleMatch) {
      const candidateTitle = (titleMatch[1] || titleMatch[2] || titleMatch[3] || '').trim();
      const candidateDesc = (titleMatch[4] || '').trim();
      if (candidateTitle.length > 0 && candidateTitle.length < 50 && candidateDesc.length > 0) {
        title = candidateTitle;
        desc = candidateDesc;
      }
    }

    const link = extractLink(desc) || extractLink(cleaned);
    const combinedText = `${title || ''} ${desc}`;
    const isFix = FIX_KEYWORDS.test(combinedText);
    const isLink = Boolean(link) || LINK_KEYWORDS.test(title || '');

    items.push({
      id: `item-${counter++}`,
      title,
      description: desc,
      isFix,
      isLink,
      link,
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
    if (first.title && first.description && first.title !== first.description) {
      return `${first.title}: ${first.description}`;
    }
    return first.title || first.description;
  }
  return 'New features and improvements';
}

/**
 * Infers a category tag in English and Malayalam from item content.
 */
export function inferItemTag(title?: string, description?: string): { en: string; ml: string } {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();

  if (/\b(changelog|compare|download|release|github|commit)\b/i.test(combined)) {
    return { en: 'Resource', ml: 'വിവരങ്ങൾ' };
  }
  if (/\b(fix|bug|issue|error|resolved|patch|hotfix)\b/i.test(combined)) {
    return { en: 'Improvement', ml: 'മെച്ചപ്പെടുത്തൽ' };
  }
  if (/\b(print|thermal|receipt|paper|cutter|tax\s*receipt)\b/i.test(combined)) {
    return { en: 'Printing', ml: 'പ്രിന്റിംഗ്' };
  }
  if (/\b(unit|pricing|product|cart|tax|gst|inclusive|exclusive)\b/i.test(combined)) {
    return { en: 'Billing', ml: 'ബില്ലിംഗ്' };
  }
  if (/\b(filing|accountant|collection|cash\s*on\s*hand)\b/i.test(combined)) {
    return { en: 'Settings', ml: 'സെറ്റിംഗ്സ്' };
  }
  if (/\b(drawer|register|cash\s*drawer|closing|hardware)\b/i.test(combined)) {
    return { en: 'Hardware', ml: 'ഹാർഡ്‌വെയർ' };
  }
  if (/\b(total|net\s*pay|discount|roundoff|grand\s*total|checkout)\b/i.test(combined)) {
    return { en: 'Checkout', ml: 'ചെക്ക്ഔട്ട്' };
  }
  if (/\b(sync|cloud|backup|network|offline)\b/i.test(combined)) {
    return { en: 'Sync', ml: 'സിങ്ക്' };
  }
  if (/\b(customer|credit|ledger|party|balance)\b/i.test(combined)) {
    return { en: 'Customers', ml: 'കസ്റ്റമേഴ്സ്' };
  }
  return { en: 'New Feature', ml: 'പുതിയ ഫീച്ചർ' };
}

/**
 * Converts dynamic release notes into rich "What's New" cards matching the design system.
 */
export function releaseNotesToCards(rawNotes: unknown, staticItems?: WhatsNewItem[]): DynamicWhatsNewCard[] {
  const items = parseReleaseNotes(rawNotes);
  return items.map((item, index) => {
    const accent = ACCENTS[index % ACCENTS.length];
    const inferredTag = inferItemTag(item.title, item.description);
    const titleEn = item.title || (item.link ? item.link.text : 'New Feature');
    const descEn = item.description || (item.link ? item.link.url : '');

    // Check if a static item matches to borrow high-quality Malayalam translations
    const matched = staticItems?.find(
      (s) => s.title.en.toLowerCase() === titleEn.toLowerCase()
    );

    const title = {
      en: titleEn,
      ml: matched ? matched.title.ml : titleEn,
    };

    const tag = matched ? matched.tag : inferredTag;

    const subtitle = matched
      ? matched.subtitle
      : (descEn.split('.')[0] || descEn);

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
