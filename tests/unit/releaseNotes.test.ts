import { describe, it, expect } from 'vitest';
import {
  parseReleaseNotes,
  getReleaseNotesSummary,
  decodeHtmlEntities,
  stripHtmlTags,
  inferItemTag,
  releaseNotesToCards,
} from '../../src/components/settings/releaseNotesUtils';
import { getWhatsNewItems, DEFAULT_WHATS_NEW } from '../../src/components/settings/whatsNew';

describe('releaseNotesUtils', () => {
  const sampleGitHubHtml = `
<h2>What's New</h2>
<ul>
<li><strong>Clean Thermal Tax Receipts</strong>: Printed receipts on 80mm thermal printers now feature a clean, uncluttered GST breakdown with clear Taxable, CGST, SGST, and total amounts tailored for retail billing.</li>
<li><strong>Quick Product Units &amp; Pricing</strong>: Choose units (pieces, kg, litres) and tax-inclusive or tax-exclusive pricing directly from the Quick Product Entry table before saving.</li>
<li><strong>Streamlined Filing-Only Mode</strong>: Decide whether filing-only bills count towards your daily drawer collection and sales today, keeping tax filing cleanly separated from physical cash.</li>
<li><strong>Cash Register &amp; Drawer Controls</strong>: Configure automatic cash drawer opening and cash register preferences directly with intuitive toggles for faster checkout and closing.</li>
<li><strong>Accurate Bill Totals &amp; Net Pay</strong>: Clear distinction between Grand Total and Net Total on printouts and screens whenever discounts or roundoffs are applied.</li>
<li><strong>Full Changelog</strong>: <a class="commit-link" href="https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.3...v2.1.4">emirateswebfusion/nafid-pos@<tt>v2.1.3...v2.1.4</tt></a></li>
</ul>
<p><strong>Download:</strong> <a href="https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.4/Nafid-Setup-2.1.4.exe">Nafid-Setup-2.1.4.exe</a></p>
`;

  const sampleV229Markdown = `
Thermal receipt layout refinement:

* Fixed right border not visible on 80mm rolls (was at 77mm, beyond typical 72 76mm printable area; now at 75mm).
* Reduced left margin gap (body left padding reduced from 3mm to 1mm).
* Removed excess top whitespace (body top padding reduced from 2mm to 0).
* Re-calibrated font-size inner width calculation to match new padding geometry.

All 35 thermal print tests pass.
`;

  const sampleV229Html = `
<p>Thermal receipt layout refinement:</p>
<ul>
<li>Fixed right border not visible on 80mm rolls (was at 77mm, beyond typical 72 76mm printable area; now at 75mm).</li>
<li>Reduced left margin gap (body left padding reduced from 3mm to 1mm).</li>
<li>Removed excess top whitespace (body top padding reduced from 2mm to 0).</li>
<li>Re-calibrated font-size inner width calculation to match new padding geometry.</li>
</ul>
<p>All 35 thermal print tests pass.</p>
`;

  it('correctly decodes HTML entities', () => {
    expect(decodeHtmlEntities('&amp; &quot; &#39; &lt; &gt; &nbsp;')).toBe('& " \' < >  ');
  });

  it('strips HTML tags and decodes entities', () => {
    expect(stripHtmlTags('<strong>Quick &amp; Easy</strong>')).toBe('Quick & Easy');
  });

  it('parses GitHub release HTML into clean items without raw tags', () => {
    const items = parseReleaseNotes(sampleGitHubHtml);
    expect(items.length).toBe(7);

    // Item 1
    expect(items[0].title).toBe('Clean Thermal Tax Receipts');
    expect(items[0].description).toContain('Printed receipts on 80mm thermal printers');
    expect(items[0].isFix).toBe(false);

    // Item 2: HTML entity &amp; should be decoded in title
    expect(items[1].title).toBe('Quick Product Units & Pricing');
    expect(items[1].description).toContain('Choose units (pieces, kg, litres)');
    expect(items[1].isFix).toBe(false);

    // Item 3
    expect(items[2].title).toBe('Streamlined Filing-Only Mode');

    // Item 4
    expect(items[3].title).toBe('Cash Register & Drawer Controls');

    // Item 5
    expect(items[4].title).toBe('Accurate Bill Totals & Net Pay');

    // Item 6: Changelog link
    expect(items[5].title).toBe('Full Changelog');
    expect(items[5].link?.url).toBe('https://github.com/emirateswebfusion/nafid-pos/compare/v2.1.3...v2.1.4');
    expect(items[5].link?.text).toBe('emirateswebfusion/nafid-pos@v2.1.3...v2.1.4');
    expect(items[5].isLink).toBe(true);

    // Item 7: Download link
    expect(items[6].title).toBe('Download');
    expect(items[6].link?.url).toBe('https://github.com/emirateswebfusion/nafid-releases/releases/download/v2.1.4/Nafid-Setup-2.1.4.exe');
    expect(items[6].link?.text).toBe('Nafid-Setup-2.1.4.exe');
    expect(items[6].isLink).toBe(true);

    // None of the items should contain raw html tags like <h2>, <ul>, <li>, <tt>
    for (const item of items) {
      expect(item.title).not.toMatch(/<[^>]+>/);
      expect(item.description).not.toMatch(/<[^>]+>/);
    }
  });

  it('extracts a clean single-line summary for banner', () => {
    const summary = getReleaseNotesSummary(sampleGitHubHtml);
    expect(summary).toBe('Clean Thermal Tax Receipts: Printed receipts on 80mm thermal printers now feature a clean, uncluttered GST breakdown with clear Taxable, CGST, SGST, and total amounts tailored for retail billing.');
    expect(summary).not.toContain('<h2>');
  });

  it('handles markdown formatted release notes', () => {
    const md = `
# What's New
* **Fix**: Fixed crash during receipt printing
* Added support for custom barcode scanning
`;
    const items = parseReleaseNotes(md);
    expect(items.length).toBe(2);
    expect(items[0].isFix).toBe(true);
    expect(items[0].title).toBe('Fix');
    expect(items[0].description).toBe('Fixed crash during receipt printing');
    expect(items[1].isFix).toBe(false);
    expect(items[1].description).toBe('Added support for custom barcode scanning');
  });

  it('parses v2.2.9 release notes without section headers or test pass lines as cards', () => {
    const mdItems = parseReleaseNotes(sampleV229Markdown);
    expect(mdItems.length).toBe(4);

    const htmlItems = parseReleaseNotes(sampleV229Html);
    expect(htmlItems.length).toBe(4);

    // Excludes "Thermal receipt layout refinement:" and "All 35 thermal print tests pass."
    for (const item of mdItems) {
      expect(item.description).not.toContain('tests pass');
      expect(item.description).not.toBe('Thermal receipt layout refinement:');
    }

    const cards = releaseNotesToCards(sampleV229Markdown);
    expect(cards.length).toBe(4);

    // Titles should be derived and specific, not generic "New Feature"
    expect(cards[0].title.en).toBe('Fixed right border not visible on 80mm rolls');
    expect(cards[0].tag.en).toBe('Printing');

    expect(cards[1].title.en).toBe('Reduced left margin gap');
    expect(cards[1].tag.en).toBe('Printing');

    expect(cards[2].title.en).toBe('Removed excess top whitespace');
    expect(cards[2].tag.en).toBe('Printing');

    expect(cards[3].title.en).toBe('Re-calibrated font-size inner width calculation');
    expect(cards[3].tag.en).toBe('Printing');
  });

  it('handles array of release notes from electron-updater', () => {
    const notesArray = [
      { version: '2.1.4', note: '<li><strong>Thermal Receipt</strong>: Better printing</li>' },
    ];
    const items = parseReleaseNotes(notesArray);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Thermal Receipt');
    expect(items[0].description).toBe('Better printing');
  });

  it('handles null, undefined, and empty string safely', () => {
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes(undefined)).toEqual([]);
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes('   ')).toEqual([]);
    expect(getReleaseNotesSummary(null)).toBe('New features and improvements');
  });

  it('infers accurate tags in English and Malayalam', () => {
    expect(inferItemTag('Clean Thermal Tax Receipts', 'Thermal printer improvements')).toEqual({ en: 'Printing', ml: 'പ്രിന്റിംഗ്' });
    expect(inferItemTag('Quick Product Units & Pricing', 'Choose pricing in product entry')).toEqual({ en: 'Billing', ml: 'ബില്ലിംഗ്' });
    expect(inferItemTag('Cash Register & Drawer Controls', 'Drawer opening preferences')).toEqual({ en: 'Hardware', ml: 'ഹാർഡ്‌വെയർ' });
    expect(inferItemTag('Accurate Bill Totals & Net Pay', 'Grand total and net pay')).toEqual({ en: 'Checkout', ml: 'ചെക്ക്ഔട്ട്' });
    expect(inferItemTag('Bug Fix', 'Fixed an error during checkout')).toEqual({ en: 'Improvement', ml: 'മെച്ചപ്പെടുത്തൽ' });
  });

  it('converts dynamic release notes to rich cards matching What is New UI', () => {
    const cards = releaseNotesToCards(sampleGitHubHtml);
    expect(cards.length).toBe(7);

    expect(cards[0].title.en).toBe('Clean Thermal Tax Receipts');
    expect(cards[0].tag.en).toBe('Printing');
    expect(cards[0].tag.ml).toBe('പ്രിന്റിംഗ്');
    expect(cards[0].accent).toBeDefined();

    expect(cards[5].title.en).toBe('Full Changelog');
    expect(cards[5].link?.url).toContain('github.com');
  });

  it('resolves dynamic cards via getWhatsNewItems and falls back to default when empty', () => {
    const dynamicItems = getWhatsNewItems(sampleGitHubHtml, '2.1.4');
    expect(dynamicItems.length).toBe(7);
    expect(dynamicItems[0].title.en).toBe('Clean Thermal Tax Receipts');

    const fallbackItems = getWhatsNewItems(null, undefined);
    expect(fallbackItems).toEqual(DEFAULT_WHATS_NEW);
    expect(fallbackItems.length).toBe(3);
  });
});
