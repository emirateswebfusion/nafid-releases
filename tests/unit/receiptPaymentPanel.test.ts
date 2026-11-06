import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import QRCode from 'qrcode';
import { generateReceiptText, type ReceiptData } from '../../src/utils/print/receiptGenerator';
import { buildReceiptHtml } from '../../electron/hardware/receiptHtml';
import { sanitizeForEscPos } from '../../electron/hardware/escPos';
import { readReceiptPointRows, receiptPaymentPanelHtml } from '../../electron/utils/receiptPaymentPanel';

const sample: ReceiptData = {
  shopName: 'Test Shop', invoiceNumber: 'TEST-1', date: '2026-11-06', items: [],
  subtotal: 100, discount: 0, tax: 0, grandTotal: 100, upiId: 'shop@upi', showUpiQr: true,
  pointsEarned: 1, pointsRedeemed: 5, pointsRedeemedDiscount: 2.5, remainingPointsBalance: -4,
};

describe('receipt QR and points panel', () => {
  it.each([58, 80])('places QR left and all four points rows right before the signature on %s mm', async width => {
    const text = generateReceiptText(sample, width / 10, undefined, 'boxed');
    expect(text.indexOf('[[QR:')).toBeLessThan(text.indexOf('Authorised Signatory'));
    expect(text.indexOf('[[QR:')).toBeLessThan(text.indexOf('Thank You'));
    const dom = new JSDOM(await buildReceiptHtml(text, width));
    const panel = dom.window.document.querySelector('[data-receipt-payment-panel]')!;
    expect(panel.children[0].querySelector('img')).not.toBeNull();
    expect(panel.children[1].textContent).toContain('Balance Points-4.00');
    expect(panel.children[1].children).toHaveLength(4);
    for (const label of ['Bill Points', 'Used Point', 'Used Amt', 'Balance Points']) {
      expect(dom.window.document.body.textContent?.split(label)).toHaveLength(2);
    }
  });

  it('keeps normal loyalty rows when QR is off', async () => {
    const text = generateReceiptText({ ...sample, showUpiQr: false }, 8, undefined, 'boxed');
    const dom = new JSDOM(await buildReceiptHtml(text, 80));
    expect(dom.window.document.querySelector('[data-receipt-payment-panel]')).toBeNull();
    expect(dom.window.document.body.textContent).toContain('Balance Points');
    expect(dom.window.document.body.textContent).toContain('-4.00');
  });

  it('does not consume partial or unrelated rows from historical receipts', () => {
    expect(readReceiptPointRows(['[[QR:test]]', '│Bill Points│1.00│', '│For Test Shop│'], 0)).toEqual([]);
  });

  it('keeps point values in the text-only network printer output', () => {
    const output = sanitizeForEscPos(generateReceiptText(sample, 8, undefined, 'boxed'));
    for (const label of ['Bill Points', 'Used Point', 'Used Amt', 'Balance Points']) {
      expect(output).toContain(label);
    }
    expect(output).toContain('-4.00');
    expect(output).not.toContain('[[QR:');
  });

  it('keeps the signature when a QR has no loyalty rows', async () => {
    const data = { ...sample, pointsEarned: 0, pointsRedeemed: 0, pointsRedeemedDiscount: 0, remainingPointsBalance: 0 };
    const dom = new JSDOM(await buildReceiptHtml(generateReceiptText(data, 8, undefined, 'boxed'), 80));
    expect(dom.window.document.querySelector('[data-receipt-payment-panel] img')).not.toBeNull();
    expect(dom.window.document.body.textContent).toContain('Authorised Signatory');
    expect(dom.window.document.body.textContent).not.toContain('Balance Points');
  });

  it('escapes panel text and image attributes', () => {
    const dom = new JSDOM(receiptPaymentPanelHtml('" onerror="alert(1)', [{ label: '<script>', value: '<img>' }]));
    expect(dom.window.document.querySelector('script')).toBeNull();
    expect(dom.window.document.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(dom.window.document.body.textContent).toContain('<script>');
  });

  it('retains points when QR generation fails', async () => {
    const failure = vi.spyOn(QRCode, 'toDataURL').mockRejectedValueOnce(new Error('QR unavailable'));
    try {
      const html = await buildReceiptHtml(generateReceiptText(sample, 8, undefined, 'boxed'), 80);
      expect(html).toContain('UPI QR unavailable');
      expect(html).toContain('Balance Points');
      expect(html).toContain('-4.00');
    } finally { failure.mockRestore(); }
  });
});
