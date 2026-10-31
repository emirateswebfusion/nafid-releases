import QRCode from 'qrcode';

/** Thermal receipt rendering: the plain-text receipt as HTML (borders, dividers, QR and Code 128 barcodes).
 * Pure function, no printer state. The page geometry is driven by @page (width fixed, height set after
 * content measurement) so a long receipt prints as a single continuous page with one cut at the end. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateCode128Svg(text: string): string {
  const patterns: string[] = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","222121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];
  
  const startB = 104;
  let checksum = startB;
  const codes: number[] = [startB];

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 94) {
      codes.push(code);
      checksum += code * (i + 1);
    }
  }
  codes.push(checksum % 103);
  codes.push(106);

  let width = 0;
  let barElements = '';
  const barHeight = 24;

  codes.forEach(codeIdx => {
    const pat = patterns[codeIdx];
    if (!pat) return;
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10) * 1.0;
      if (j % 2 === 0) {
        barElements += `<rect x="${width.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${barHeight}" fill="#000" />`;
      }
      width += w;
    }
  });

  return `<div style="width:100%;display:flex;justify-content:center;margin:4px 0;">
    <svg width="${width.toFixed(1)}" height="${barHeight}" viewBox="0 0 ${width.toFixed(1)} ${barHeight}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      ${barElements}
    </svg>
  </div>`;
}

function isTopBorderLine(str: string): boolean {
  const s = str.trim();
  if (s.length < 4) return false;
  const f = s.charAt(0);
  const l = s.charAt(s.length - 1);
  const isCorner = (f === '┌' || f === '+' || f === '|') && (l === '┐' || l === '+' || l === '|');
  if (!isCorner) return false;
  const mid = s.substring(1, s.length - 1);
  return /^─+$/.test(mid) || /^-+$/.test(mid) || /^=+$/.test(mid);
}

function isBottomBorderLine(str: string): boolean {
  const s = str.trim();
  if (s.length < 4) return false;
  const f = s.charAt(0);
  const l = s.charAt(s.length - 1);
  const isCorner = (f === '└' || f === '+' || f === '|') && (l === '┘' || l === '+' || l === '|');
  if (!isCorner) return false;
  const mid = s.substring(1, s.length - 1);
  return /^─+$/.test(mid) || /^-+$/.test(mid) || /^=+$/.test(mid);
}

function isDividerLine(str: string): boolean {
  const s = str.trim();
  if (s.length < 4) return false;
  const f = s.charAt(0);
  const l = s.charAt(s.length - 1);
  const isEdge = (f === '├' || f === '+' || f === '|' || f === '┌') && (l === '┤' || l === '+' || l === '|' || l === '┐');
  if (!isEdge) return false;
  const mid = s.substring(1, s.length - 1);
  return /^[─┼┬┴]+$/.test(mid) || /^[-+|]+$/.test(mid) || /^=+$/.test(mid);
}

function stripOuterPipes(str: string): string {
  if (str.length < 2) return str;
  const f = str.charAt(0);
  const l = str.charAt(str.length - 1);
  if ((f === '│' || f === '|') && (l === '│' || l === '|')) {
    return str.substring(1, str.length - 1);
  }
  return str;
}

export async function buildReceiptHtml(receiptText: string, widthMm: number, fontFamily: string = 'Consolas, monospace', leftMarginOffsetMm: number = 0): Promise<string> {
  const lines = receiptText.split('\n');
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++;
  let endIdx = lines.length - 1;
  while (endIdx >= startIdx && lines[endIdx].trim() === '') endIdx--;
  const activeLines = lines.slice(startIdx, endIdx + 1);

  const isBillStyle = receiptText.includes('│') || receiptText.includes('┌') || receiptText.includes('├') ||
    activeLines.some(l => {
      const s = l.trim();
      return (s.startsWith('|') && s.endsWith('|')) || (s.startsWith('+') && s.endsWith('+'));
    });

  let rowsHtml = '';
  for (let i = 0; i < activeLines.length; i++) {
    const line = activeLines[i];
    if (line.includes('[[QR:')) {
      const match = line.match(/\[\[QR:([^\]]+)\]\]/);
      if (match) {
        try {
          const dataUrl = await QRCode.toDataURL(match[1], { width: 280, margin: 1, errorCorrectionLevel: 'M' });
          rowsHtml += `<div style="width:100%;text-align:center;margin:6px 0;"><img src="${dataUrl}" style="max-width:min(180px,100%);height:auto;display:inline-block;" /></div>`;
        } catch {
          rowsHtml += `<pre style="margin:0;text-align:center;">[QR CODE]</pre>`;
        }
        continue;
      }
    }
    if (line.includes('[[BARCODE:')) {
      const match = line.match(/\[\[BARCODE:([^\]]+)\]\]/);
      if (match) {
        rowsHtml += generateCode128Svg(match[1]);
        continue;
      }
    }
    if (line.includes('[[PROMINENT:')) {
      const match = line.match(/\[\[PROMINENT:([^\]]+)\]\]/);
      if (match) {
        rowsHtml += `<div style="width:100%;text-align:center;font-size:14px;font-weight:900;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;margin:4px 0;">${escapeHtml(match[1])}</div>`;
        continue;
      }
    }
    let lhMultiplier = 1.0;
    let cleanLine = line;
    if (line.startsWith('[[LH:')) {
      const match = line.match(/^\[\[LH:([^\]]+)\]\]/);
      if (match) {
        lhMultiplier = Number(match[1]) || 1.0;
        cleanLine = line.substring(match[0].length);
      }
    }

    let displayValue = cleanLine.replace(/\r/g, '');

    if (isBillStyle) {
      if (isTopBorderLine(displayValue) && i === 0) {
        continue;
      }
      if (isBottomBorderLine(displayValue) && i >= activeLines.length - 2) {
        continue;
      }
      if (isDividerLine(displayValue)) {
        const hasVisibleAfter = activeLines.slice(i + 1).some(l => {
          let c = l;
          if (c.startsWith('[[LH:')) {
            const m = c.match(/^\[\[LH:([^\]]+)\]\]/);
            if (m) c = c.substring(m[0].length);
          }
          const val = c.replace(/\r/g, '');
          if (isTopBorderLine(val) || isBottomBorderLine(val) || isDividerLine(val)) {
            return false;
          }
          return val.trim().length > 0;
        });

        if (!hasVisibleAfter) {
          continue;
        }

        rowsHtml += `<hr style="border:none;border-top:2px solid black;margin:0 -3px;padding:0;" />`;
        continue;
      }

      displayValue = stripOuterPipes(displayValue);
    }

    const trimmed = displayValue.trim();
    let isCentered = false;
    let finalValue = displayValue;
    if (trimmed && !displayValue.includes('│') && !displayValue.includes('|')) {
      const leading = displayValue.length - displayValue.trimStart().length;
      const trailing = displayValue.length - displayValue.trimEnd().length;
      if (leading >= 1 && trailing >= 1 && Math.abs(leading - trailing) <= 2) {
        isCentered = true;
        finalValue = trimmed;
      }
    }

    const lh = isBillStyle ? 1.08 : 1.25;
    rowsHtml += `<pre style="margin:0;padding:0;font-family:inherit;font-size:inherit;line-height:${(lhMultiplier * lh).toFixed(2)};font-weight:700;letter-spacing:0px;text-align:${isCentered ? 'center' : 'left'};white-space:${isCentered ? 'pre-wrap' : 'pre'};word-break:${isCentered ? 'break-word' : 'normal'};overflow:hidden;">${escapeHtml(finalValue)}</pre>`;
  }

  let maxContentChars = 0;
  for (const line of activeLines) {
    if (line.includes('[[') && line.includes(']]')) continue;
    let s = line.replace(/\r/g, '');
    if (isBillStyle) {
      if (isTopBorderLine(s) || isBottomBorderLine(s) || isDividerLine(s)) continue;
      s = stripOuterPipes(s);
    }
    const len = s.length;
    if (len > maxContentChars) maxContentChars = len;
  }

  const offset = Number.isFinite(leftMarginOffsetMm) ? Math.max(0, Math.min(leftMarginOffsetMm, widthMm / 4)) : 0;
  const innerWidthMm = Math.max(30, (widthMm - offset) - (isBillStyle ? 9 : 6));
  const innerWidthPx = innerWidthMm * (96 / 25.4);
  const targetChars = Math.max(maxContentChars, widthMm >= 75 ? 40 : 30);
  const maxFontPx = Math.floor((innerWidthPx / (targetChars * 0.61)) * 10) / 10;
  const fontSize = widthMm <= 58
    ? (maxContentChars > 34 ? `${Math.min(8.0, maxFontPx)}px` : `${Math.min(9.5, maxFontPx)}px`)
    : `${Math.min(10.5, maxFontPx)}px`;

  const contentBody = isBillStyle
    ? `<div style="border:2px solid black;padding:3px 2px;width:100%;max-width:100%;box-sizing:border-box;background:#fff;display:block;overflow:hidden;">${rowsHtml}</div>`
    : rowsHtml;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: ${widthMm}mm auto;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: ${fontFamily};
    font-size: ${fontSize};
    color: #000;
    background: #fff;
    width: ${widthMm}mm;
    height: auto !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    padding: 2mm 3mm;
    margin: 0;
    position: relative;
    left: ${offset}mm;
    width: ${widthMm - offset}mm;
    height: auto !important;
    overflow: visible !important;
  }
  pre, img, svg { max-width: 100%; }
  pre, img, svg, hr { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    html, body { height: auto !important; overflow: visible !important; }
    div, pre { overflow: visible !important; }
  }
</style>
</head>
<body>
  ${contentBody}
  <script>
    window.addEventListener('load', async () => {
      if (document.fonts) {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((r) => setTimeout(r, 600))
          ]);
        } catch { /* proceed */ }
      }
      // Fit every fixed-width row before measuring height, including wide fonts and calibrated offsets.
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      let scale = 1;
      if (context) for (const row of document.querySelectorAll('pre')) {
        const css = getComputedStyle(row);
        context.font = css.fontWeight + ' ' + css.fontSize + ' ' + css.fontFamily;
        const needed = context.measureText(row.textContent || '').width;
        if (needed > row.clientWidth) scale = Math.min(scale, row.clientWidth / needed);
      }
      if (scale < 1) document.body.style.fontSize = (parseFloat(getComputedStyle(document.body).fontSize) * scale * 0.99) + 'px';
      const height = document.body.scrollHeight;
      const pageHeightMm = Math.max(40, Math.ceil(height * 25.4 / 96 + 3));
      const pageStyle = document.createElement('style');
      pageStyle.textContent = '@page { size: ${widthMm}mm ' + pageHeightMm + 'mm; margin: 0; }';
      document.head.appendChild(pageStyle);
      if (window.electronAPI?.printReady) {
        window.electronAPI.printReady(height);
      }
    });
  </script>
</body>
</html>`;
}
