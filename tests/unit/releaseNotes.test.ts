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

  it('cleanly parses v2.2.44 release notes excluding developer verification sections and metadata', () => {
    const v2244Raw = `## Nafid POS 2.2.44

- Cash Register: removes legacy duplicate scrap purchase movements, filters them consistently in history, and immediately updates drawer totals after cleanup. Standalone purchases and named-user cash entries remain intact.
- Shop closing: enabled Gross Sales is always shown and uses sales value before invoice discounts and scrap/return credit deductions.
- WhatsApp bills and PDFs: share the checkout item prices, HSN/SAC and tax rates, subtotal, discounts and GST components. History sharing and reprints preserve stored CGST/SGST/IGST cents and keep UAE VAT distinct.
- Staff: attendance can be marked on every day of an empty month, including holidays; monthly pay statements classify entries in the shop timezone. Salary, advances, purchases, deductions, payouts and ledger balances have integration coverage.
- Inventory: inline Add Tier prevents duplicate submissions and keeps failed saves editable; Escape cancels the tier entry without closing the product form.
- Sign-in: remembers the last shop and user on this PC and shows their name/role beside the shop. Switch User / Sign in with Email is available; legacy multi-shop PCs without remembered context require an explicit email login.

### Windows upgrade

If an older installer/updater cannot complete the update, close Nafid normally and run this full installer once. Existing shop data/settings are preserved by the tested upgrade path. Windows publisher/signing restrictions are separate from updater behavior; this release does not claim to remove them.


### Verification

- 161 test files / 1,012 tests passed, architecture guard passed, lint: zero errors and warnings.
- 1,997 IPC calls compared; only the intended closing/session changes remained after per-database identity normalization.
- Final installer extraction, production updater/runtime configuration, native SQLite, data preservation, measured verification events, launch failure/retry and candidate updater handoff passed in a disposable Windows runner.
- Source: [PR #63](https://github.com/emirateswebfusion/nafid-pos/pull/63), commit \`21fef20f522c8840aaefde1f93bb1f65fc78f345\`; its tree matches the tested build source \`111a6e6b878234f8af74a4ffa1b34b778c6e0b51\`.
- [Source CI](https://github.com/emirateswebfusion/nafid-pos/actions/runs/41982737196) and [Windows acceptance](https://github.com/emirateswebfusion/nafid-pos/actions/runs/41982735840).
- Installer SHA-256: \`c2ccb13248f13a608940301fe73fe2453a828715138f5bd77727d7a5afd1c731\`.
- Signature status: **NotSigned**. This installer does not resolve a Smart App Control publisher block; trusted Windows signing remains outstanding.
`;
    const cards = releaseNotesToCards(v2244Raw);

    // Exactly the 6 user-facing features should be returned
    expect(cards.length).toBe(6);

    // Titles must be clean and not include colon or trailing sentences
    expect(cards[0].title.en).toBe('Cash Register');
    expect(cards[0].text.en).toMatch(/^Removes legacy duplicate scrap purchase movements/);
    expect(cards[0].title.ml).toBe('ക്യാഷ് രജിസ്റ്റർ');

    expect(cards[1].title.en).toBe('Shop closing');
    expect(cards[1].tag.en).toBe('Closing');
    expect(cards[1].title.ml).toBe('കട അടയ്ക്കൽ & ഗ്രോസ് സെയിൽസ്');

    expect(cards[2].title.en).toBe('WhatsApp bills and PDFs');
    expect(cards[2].tag.en).toBe('Sharing');
    expect(cards[2].title.ml).toBe('വാട്ട്‌സ്ആപ്പ് & പിഡിഎഫ് ബില്ലുകൾ');

    expect(cards[3].title.en).toBe('Staff');
    expect(cards[3].tag.en).toBe('Staff');
    expect(cards[3].title.ml).toBe('ജീവനക്കാരുടെ ഹാജരും ശമ്പളവും');

    expect(cards[4].title.en).toBe('Inventory');
    expect(cards[4].tag.en).toBe('Inventory');
    expect(cards[4].title.ml).toBe('സ്റ്റോക്കും വില വിവരങ്ങളും');

    expect(cards[5].title.en).toBe('Sign-in');
    expect(cards[5].tag.en).toBe('Security');
    expect(cards[5].title.ml).toBe('ലളിതമായ ലോഗിൻ വിവരങ്ങൾ');

    // No developer metadata or verification text must leak into cards
    for (const card of cards) {
      expect(card.title.en).not.toMatch(/1,?997|IPC|SHA|NotSigned|runner|installer extraction|commit|PR #/i);
      expect(card.text.en).not.toMatch(/1,?997|IPC calls|SHA-256|NotSigned|disposable Windows runner|161 test files/i);
    }
  });
});
