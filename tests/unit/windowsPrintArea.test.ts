import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { parseReceiptPrintArea } from '../../electron/hardware/windowsPrintArea';
import { buildReceiptHtml } from '../../electron/hardware/receiptHtml';

describe('driver printable geometry', () => {
  it.each([
    [180, 566, 512, 27],
    [180, 411, 360, 27],
    [203, 640, 576, 32],
    [203, 464, 384, 40],
  ])('converts real device dots at %s dpi instead of assuming roll width', (dpi, paper, width, left) => {
    const area = parseReceiptPrintArea(JSON.stringify({ dpi, paper, width, left }));
    expect(area.printableWidthMm).toBeCloseTo(width * 25.4 / dpi);
    expect(area.leftMm).toBeCloseTo(left * 25.4 / dpi);
  });
  it.each([
    {}, { dpi: 0, paper: 640, width: 576, left: 32 },
    { dpi: 203, paper: 600, width: 576, left: 32 },
    { dpi: 203, paper: 640, width: 576, left: -1 },
    { dpi: '203', paper: 640, width: 576, left: 32 },
    { dpi: 600, paper: 5100, width: 4800, left: 150 },
  ])('rejects invalid or non-thermal capabilities: %j', value => {
    expect(() => parseReceiptPrintArea(JSON.stringify(value))).toThrow();
  });
  it.each([-3, 0, 2])('fits an 80 mm receipt inside a narrower driver with %s mm calibration', async offset => {
    const area = { paperWidthMm: 58, printableWidthMm: 48, leftMm: 4 };
    const dom = new JSDOM(await buildReceiptHtml('│Amount    1430.00│', 80, 'monospace', offset, true, area));
    const css = dom.window.getComputedStyle(dom.window.document.body);
    const inkLeft = parseFloat(css.left) + 3;
    const inkRight = parseFloat(css.width) + parseFloat(css.left) - 3;
    expect(inkLeft).toBeCloseTo(4 + 2 * 25.4 / 96 + Math.max(0, offset));
    expect(inkRight).toBeCloseTo(52 - 2 * 25.4 / 96);
    expect(dom.window.getComputedStyle(dom.window.document.documentElement).width).toBe('58mm');
  });
  it('ignores device geometry for WhatsApp/PDF output', async () => {
    const dom = new JSDOM(await buildReceiptHtml('Bill', 80, 'monospace', 0, false,
      { paperWidthMm: 58, printableWidthMm: 48, leftMm: 4 }));
    expect(dom.window.getComputedStyle(dom.window.document.body).width).toBe('80mm');
  });
});
