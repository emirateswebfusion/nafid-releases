// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_SECTIONS, sectionMatchesSearch, findSettingsSection } from '../../src/components/settings/settingsSections';
import { SettingsSidebar } from '../../src/components/settings/views/SettingsSidebar';

afterEach(cleanup);

const searchIds = (query: string) => SETTINGS_SECTIONS.filter(s => sectionMatchesSearch(s, query)).map(s => s.id);

describe('settings navigation', () => {
  it('has unique section ids, each rendered by the section router', () => {
    const ids = SETTINGS_SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const router = readFileSync('src/components/settings/views/SettingsSectionContent.tsx', 'utf8');
    for (const id of ids) expect(router, `no case for section "${id}"`).toContain(`case '${id}':`);
  });

  it('finds settings by everyday words', () => {
    expect(searchIds('upi')).toEqual(['tax_bank', 'cash']);
    expect(searchIds('drawer')).toContain('cash');
    expect(searchIds('loyalty')).toContain('customers');
    expect(searchIds('invoice prefix')).toEqual(['numbering']);
    expect(searchIds('password')).toEqual(['account']);
    expect(searchIds('  ')).toHaveLength(SETTINGS_SECTIONS.length);
    expect(findSettingsSection('labels')?.label).toBe('Barcode Labels');
  });

  it('hides owner-only pages from staff and filters by search', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SettingsSidebar activeSection="hardware" isAdmin={false} onSelect={onSelect} />);
    expect(screen.queryAllByRole('button', { name: /Invoice Numbering/ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Printers & Devices/ }).length).toBeGreaterThan(0);

    rerender(<SettingsSidebar activeSection="store" isAdmin onSelect={onSelect} />);
    fireEvent.change(screen.getAllByLabelText('Search settings')[0], { target: { value: 'upi' } });
    expect(screen.queryAllByRole('button', { name: /Shop Profile/ })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Tax, Bank & UPI/ })[0]);
    expect(onSelect).toHaveBeenCalledWith('tax_bank');

    fireEvent.change(screen.getAllByLabelText('Search settings')[0], { target: { value: 'zzzz' } });
    expect(screen.getAllByText(/No settings match/).length).toBeGreaterThan(0);
  });
});
