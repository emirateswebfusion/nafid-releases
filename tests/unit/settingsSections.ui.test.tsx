// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/data/settings', () => ({ getSetting: vi.fn().mockResolvedValue(null), setSetting: vi.fn().mockResolvedValue(undefined), getAllSettings: vi.fn().mockResolvedValue({}) }));

const { SETTINGS_SECTIONS } = await import('../../src/components/settings/settingsSections');
const { SettingsSectionContent } = await import('../../src/components/settings/views/SettingsSectionContent');
const { useSettingsFormState } = await import('../../src/components/settings/hooks/useSettingsFormState');
const { DEFAULT_FEATURE_FLAGS } = await import('../../src/config/featureFlags');

afterEach(cleanup);

function Section({ id }: { id: string }) {
  const form = useSettingsFormState();
  return (
    <div data-testid="section">
      <SettingsSectionContent
        activeSection={id} sectionId={id} featureFlags={{ ...DEFAULT_FEATURE_FLAGS }} fetchPrinters={async () => {}}
        handleChangePassword={async () => {}} handleInstallUpdate={() => {}} handleRetryDownload={() => {}}
        handleToggleFeatureFlag={() => {}} returnPrefix="" returnStartNumber={1} role="ADMIN"
        setActiveSection={() => {}} tenantId="t" form={form}
      />
    </div>
  );
}

// Text each regrouped page must show, proving the moved cards landed on the right page.
const EXPECTED: Record<string, RegExp> = {
  store: /Shop Details/,
  tax_bank: /UPI Payments/,
  numbering: /Purchase Bill Counter/,
  billing: /Biller PIN Protection/,
  cash: /Default Opening Amount|Auto Open Cash Drawer/,
  customers: /Party Ledger Balance Modes/,
  print_options: /Bill Content Checklist/,
  labels: /Auto Print Barcode for New Products/,
  products: /Stock Report Default View/,
  account: /Update Password/,
  system: /System Updates/,
  features: /Turn On All/,
};

describe('settings pages', () => {
  it.each(SETTINGS_SECTIONS.map(s => s.id))('renders the %s page', async (id) => {
    render(<Section id={id} />);
    const root = screen.getByTestId('section');
    if (EXPECTED[id]) expect(await screen.findAllByText(EXPECTED[id])).not.toHaveLength(0);
    else expect(root).toBeTruthy();
  });

  it('shows each moved setting on exactly one page', async () => {
    const pagesWith = (text: RegExp) => SETTINGS_SECTIONS.filter(({ id }) => {
      const { container, unmount } = render(<Section id={id} />);
      const found = text.test(container.textContent || '');
      unmount();
      return found;
    }).map(s => s.id);
    expect(pagesWith(/Biller PIN Protection/)).toEqual(['billing']);
    expect(pagesWith(/Open Cash Drawer on Pending Payment/)).toEqual(['cash']);
    expect(pagesWith(/Show Fully Paid Cash Transactions/)).toEqual(['customers']);
    expect(pagesWith(/Show GST \/ Estimate \/ Paper Badges/)).toEqual(['products']);
    expect(pagesWith(/Change Password/)).toEqual(['account']);
  });
});
