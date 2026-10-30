/** Shared renderer-side receipt preparation; also executed by main immediately before native printing. */
export const receiptLayoutScript = `(async () => {
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 600))]);
  if (!document.querySelector('.receipt-row-text')) return { height: 0, overflow: 1 };
  if (!window.__nafidReceiptFit) {
      // Measure rendered spans, without canvas/GPU support. cqw follows the real print layout width.
      const fitRows = () => {
        const baseFont = parseFloat(getComputedStyle(document.body).fontSize);
        document.body.style.removeProperty('--receipt-row-size');
        document.body.style.removeProperty('--receipt-glyph-width');
        const texts = [...document.querySelectorAll('.receipt-row-text')];
        const measure = text => { const range = document.createRange(); range.selectNodeContents(text); return range.getBoundingClientRect().width; };
        let ratio = 1;
        for (const text of texts) {
          text.style.width = '';
          const needed = measure(text);
          const row = text.parentElement;
          if (needed > 0 && row) ratio = Math.min(ratio, parseFloat(getComputedStyle(row).fontSize) / needed);
        }
        document.body.style.setProperty('--receipt-row-size', 'min(' + baseFont + 'px, calc(100cqw * ' + ratio * 0.98 + '))');
        // Some installed bitmap/hinted fonts stop shrinking at small sizes. Fit their actual glyph bounds too.
        let glyphWidth = 1;
        for (const text of texts) {
          const width = measure(text);
          text.style.width = width + 'px';
          glyphWidth = Math.max(glyphWidth, width);
        }
        document.body.style.setProperty('--receipt-glyph-width', glyphWidth + 'px');
      };
      window.addEventListener('beforeprint', fitRows);
      let lastWidth = 0;
      if (window.ResizeObserver) new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        if (Math.abs(width - lastWidth) > 0.1) { lastWidth = width; fitRows(); }
      }).observe(document.querySelector('.receipt-content'));
      if (document.fonts) document.fonts.addEventListener('loadingdone', fitRows);
    window.__nafidReceiptFit = fitRows;
  }
  window.__nafidReceiptFit();
  let overflow = 0;
  for (const text of document.querySelectorAll('.receipt-row-text')) {
    const range = document.createRange(); range.selectNodeContents(text);
    const ink = range.getBoundingClientRect(), row = text.parentElement.getBoundingClientRect();
    if (ink.width > 0 && (ink.width > row.width + 0.5 || ink.left < row.left - 0.5 || ink.right > row.right + 0.5)) overflow++;
  }
  return { height: document.body.scrollHeight, overflow };
})()`;

export async function prepareReceiptLayout(window: { webContents: { executeJavaScript: (script: string) => Promise<unknown> } }): Promise<void> {
  const result: unknown = await window.webContents.executeJavaScript(receiptLayoutScript);
  const layout = result && typeof result === 'object' ? result as Record<string, unknown> : null;
  if (!layout || typeof layout.height !== 'number' || !Number.isFinite(layout.height) || layout.height <= 0 || layout.overflow !== 0) {
    throw new Error('Receipt text could not fit inside its border. Please retry the saved bill with a different receipt font.');
  }
}
