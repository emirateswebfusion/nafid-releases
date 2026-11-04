// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UaeArabicPrintSetting } from '../../src/components/settings/tabs/UaeArabicPrintSetting';
import { DEFAULT_UAE_ARABIC_PRINT, getUaeArabicPrint, normalizeUaeArabicPrint, setUaeArabicPrint } from '../../src/utils/print/uaeLabels';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/data/settings', () => ({ getSetting: mocks.get, setSetting: mocks.set }));
vi.mock('../../src/store/authStore', () => ({ useAuthStore: (selector: (state: { tenantId: string }) => unknown) => selector({ tenantId: 't' }) }));

afterEach(() => { cleanup(); setUaeArabicPrint(undefined); });
beforeEach(() => { mocks.get.mockReset().mockResolvedValue(null); mocks.set.mockReset().mockResolvedValue(undefined); });

describe('uae_arabic_print setting', () => {
  it('defaults to Arabic on documents and off on thermal, and survives bad stored values', () => {
    expect(DEFAULT_UAE_ARABIC_PRINT).toEqual({ documents: true, thermal: false });
    expect(normalizeUaeArabicPrint(null)).toEqual({ documents: true, thermal: false });
    expect(normalizeUaeArabicPrint('not json')).toEqual({ documents: true, thermal: false });
    expect(normalizeUaeArabicPrint('{"thermal":true}')).toEqual({ documents: true, thermal: true });
    expect(normalizeUaeArabicPrint({ documents: false, thermal: 'yes' })).toEqual({ documents: false, thermal: false });
  });

  it('marks the section dirty and saves through the settings Save button only', async () => {
    const dirty: boolean[] = [];
    const onDirty = (e: Event) => dirty.push(Boolean((e as CustomEvent<{ dirty: boolean }>).detail.dirty));
    window.addEventListener('settings:section-dirty', onDirty);
    render(<UaeArabicPrintSetting />);
    const thermal = screen.getByRole('switch', { name: 'Arabic on thermal receipts' });
    await waitFor(() => expect((thermal as HTMLButtonElement).disabled).toBe(false));
    expect(thermal.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(thermal);
    expect(thermal.getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(dirty.at(-1)).toBe(true));
    expect(mocks.set).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('settings:request-save'));
    await waitFor(() => expect(mocks.set).toHaveBeenCalledWith({ tenant_id: 't', key: 'uae_arabic_print', value: { documents: true, thermal: true } }));
    await waitFor(() => expect(getUaeArabicPrint()).toEqual({ documents: true, thermal: true }));
    await waitFor(() => expect(dirty.at(-1)).toBe(false));
    window.removeEventListener('settings:section-dirty', onDirty);
  });

  it('shows the stored choice', async () => {
    mocks.get.mockResolvedValue(JSON.stringify({ documents: false, thermal: true }));
    render(<UaeArabicPrintSetting />);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Arabic on A4 / PDF bills, quotations and WhatsApp' }).getAttribute('aria-checked')).toBe('false'));
    expect(screen.getByRole('switch', { name: 'Arabic on thermal receipts' }).getAttribute('aria-checked')).toBe('true');
  });
});
