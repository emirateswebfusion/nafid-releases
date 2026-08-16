import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import Barcode from 'react-barcode';
import { useAuthStore } from '../store/authStore';

const FONT_MAP: Record<string, string> = {
  courier: 'Consolas, "Courier New", monospace',
  consolas: 'Consolas, monospace',
  lucida: '"Lucida Console", monospace',
  'lucida-sans': '"Lucida Sans Typewriter", "Lucida Console", monospace',
  monospace: 'monospace',
};

type ReceiptRow =
  | { type: 'text'; value: string; lhMultiplier: number }
  | { type: 'qr'; payload: string }
  | { type: 'prominent'; value: string }
  | { type: 'barcode'; payload: string };

// Helper to strip leading and trailing empty lines
function parseReceiptToRows(input: string): ReceiptRow[] {
  const lines = input.split('\n');
  const rows: ReceiptRow[] = [];

  // Trim leading empty lines
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx].trim() === '') {
    startIdx++;
  }
  // Trim trailing empty lines
  let endIdx = lines.length - 1;
  while (endIdx >= startIdx && lines[endIdx].trim() === '') {
    endIdx--;
  }

  const activeLines = lines.slice(startIdx, endIdx + 1);

  activeLines.forEach((line) => {
    if (line.includes('[[QR:')) {
      const match = line.match(/\[\[QR:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'qr', payload: match[1] });
        return;
      }
    }

    if (line.includes('[[PROMINENT:')) {
      const match = line.match(/\[\[PROMINENT:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'prominent', value: match[1] });
        return;
      }
    }

    if (line.includes('[[BARCODE:')) {
      const match = line.match(/\[\[BARCODE:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'barcode', payload: match[1] });
        return;
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

    rows.push({ type: 'text', value: cleanLine, lhMultiplier });
  });

  return rows;
}

export function PrintReceiptView({ text }: { text: string }) {
  const [receiptText, setReceiptText] = useState(text || '');
  const [fontFamily, setFontFamily] = useState('Consolas, "Courier New", monospace');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [paperWidth, setPaperWidth] = useState(80); // default to 80mm

  const rows = useMemo(() => parseReceiptToRows(receiptText), [receiptText]);

  const qrPayloads = useMemo(
    () => Array.from(new Set(rows.filter(r => r.type === 'qr').map(r => (r as any).payload))),
    [rows]
  );
  const isQrReady = qrPayloads.length === 0 || qrPayloads.every((payload) => Boolean(qrImages[payload]));

  useEffect(() => {
    if (!text && window.electronAPI?.getReceiptText) {
      window.electronAPI.getReceiptText().then((t: string) => {
        if (t) setReceiptText(t);
      });
    }
  }, [text]);

  useEffect(() => {
    (async () => {
      try {
        const tenantId = useAuthStore.getState().tenantId;
        const printFmt = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'print_format' });
        if (printFmt?.receiptFont && FONT_MAP[printFmt.receiptFont]) {
          setFontFamily(FONT_MAP[printFmt.receiptFont]);
        }
        if (printFmt?.width) {
          setPaperWidth(Number(printFmt.width));
        }
      } catch {
        // fallback to default
      }
    })();
  }, []);

  useEffect(() => {
    if (!receiptText || !isQrReady) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        // Measure the actual rendered content height so printer.ts can set
        // an exact page height — eliminates the large blank gap at the bottom.
        const contentHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        window.electronAPI.printReady(contentHeight);
      }
    }, 200); // 200ms: enough for fonts + barcodes to fully paint
    return () => clearTimeout(timer);
  }, [receiptText, isQrReady]);

  useEffect(() => {
    if (qrPayloads.length === 0) {
      setQrImages({});
      return;
    }

    Promise.all(
      qrPayloads.map(async (payload) => {
        const url = await QRCode.toDataURL(payload, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
        return [payload, url] as const;
      })
    )
      .then((pairs) => {
        const map: Record<string, string> = {};
        pairs.forEach(([payload, url]) => {
          map[payload] = url;
        });
        setQrImages(map);
      })
      .catch(() => {
        setQrImages({});
      });
  }, [qrPayloads]);

  if (!receiptText) return null;

  const isBillStyle = receiptText.includes('│') || receiptText.includes('┌');
  const lh = isBillStyle ? 1.15 : 1.2;

  // ─── Layout constants (ALL in physical mm — avoids 100% resolution ambiguity) ─
  // We keep the receipt container box width at exactly 66mm (for 80mm roll) or 42mm (for 58mm roll)
  // and left-align it with a 2mm offset. This balances left/right gaps and guarantees borders never clip.
  // To increase the font size without widening the container, we remove the horizontal padding (INNER_PX_HORIZ = 0).
  // ─────────────────────────────────────────────────────────────────────────────
  const PX_PER_MM       = 96 / 25.4;
  const charsPerLine    = paperWidth >= 75 ? 36 : 32;
  const containerWidthMm = paperWidth >= 75 ? 64 : 42;          // 64mm (safety for max print widths) or 42mm
  const BORDER_PX       = 2;                                     // px each side
  const INNER_PX_VERT   = 8;                                     // top/bottom padding px inside box
  const INNER_PX_HORIZ  = paperWidth >= 75 ? 3 : 2;              // small left/right gap to keep text off the border
  
  const textWidthMm     = containerWidthMm - 2 * (BORDER_PX + INNER_PX_HORIZ) / PX_PER_MM;
  const fontPt          = Math.floor((textWidthMm / (charsPerLine * 0.353 * 0.55)) * 10) / 10;
  const fontSize        = `${fontPt}pt`;

  const dynamicPrintStyles = `
    @page {
      margin: 0;
      size: ${paperWidth}mm auto;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${paperWidth}mm;
      background: white;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    @media print {
      html, body {
        margin: 0;
        padding: 0;
        width: ${paperWidth}mm;
        background: white;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;

  return (
    <div id="receipt-root" style={{ width: '100%', backgroundColor: 'white', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <style>{dynamicPrintStyles}</style>
      <div style={{
        margin: '2mm 0 2mm 5.5mm', // Fixed left margin of 5.5mm shifts container past unprintable areas
        width: `${containerWidthMm}mm`,
        padding: isBillStyle ? `${INNER_PX_VERT}px ${INNER_PX_HORIZ}px` : `${INNER_PX_VERT}px ${INNER_PX_HORIZ}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        border: isBillStyle ? `${BORDER_PX}px solid black` : 'none',
        boxSizing: 'border-box',
        backgroundColor: 'white',
        overflow: 'hidden',  // clip any sub-pixel text overflow inside the border, not past it
      }}>
        {rows.map((row, index) => {
          if (row.type === 'text') {
            let displayValue = row.value.replace(/\r/g, '');
            if (isBillStyle) {
              const firstChar = displayValue.charAt(0);
              const lastChar = displayValue.charAt(displayValue.length - 1);
              if ((firstChar === '┌' && lastChar === '┐') || (firstChar === '└' && lastChar === '┘')) {
                return null;
              }
              if (firstChar === '├' && lastChar === '┤') {
                // If there are no visible lines after this separator, skip rendering it
                // to eliminate the double-line at the bottom of the boxed receipt.
                const hasVisibleAfter = rows.slice(index + 1).some(r => {
                  if (r.type === 'text') {
                    const val = r.value.replace(/\r/g, '');
                    const f = val.charAt(0);
                    const l = val.charAt(val.length - 1);
                    if ((f === '┌' && l === '┐') || (f === '└' && l === '┘') || (f === '├' && l === '┤')) {
                      return false;
                    }
                    return val.trim().length > 0;
                  }
                  return true;
                });
                if (!hasVisibleAfter) {
                  return null;
                }
                return <hr key={`sep-${index}`} style={{ border: 'none', borderTop: '2px solid black', margin: `0 -${INNER_PX_HORIZ}px`, padding: 0 }} />;
              }
              if (firstChar === '│' && lastChar === '│') {
                displayValue = displayValue.substring(1, displayValue.length - 1);
              }
            }

            // Determine if this line is mathematically centered by checking for roughly equal leading and trailing space padding.
            // Exclude lines containing internal column separators to protect table column alignment.
            let isCentered = false;
            let finalValue = displayValue;
            const trimmed = displayValue.trim();
            if (trimmed && !displayValue.includes('│')) {
              const leadingSpaces = displayValue.length - displayValue.trimStart().length;
              const trailingSpaces = displayValue.length - displayValue.trimEnd().length;
              if (Math.abs(leadingSpaces - trailingSpaces) <= 2) {
                isCentered = true;
                finalValue = trimmed;
              }
            }

            return (
              <pre key={`text-${index}`} style={{
                margin: 0,
                padding: 0,
                fontSize,
                fontFamily,
                whiteSpace: isCentered ? 'pre-wrap' : 'pre',
                color: 'black',
                fontWeight: 700,
                lineHeight: lh * row.lhMultiplier,
                textAlign: isCentered ? 'center' : 'left',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0px',
                width: isCentered ? '100%' : 'auto',
              }}>
                {finalValue}
              </pre>
            );
          }

          if (row.type === 'prominent') {
            return (
              <div key={`prominent-${index}`} style={{
                width: '100%',
                padding: '6px 0',
                display: 'flex',
                justifyContent: 'center',
                boxSizing: 'border-box',
                borderTop: '1px dashed black',
                borderBottom: '1px dashed black',
                margin: '4px 0',
              }}>
                <span style={{
                  fontSize: '12pt',
                  fontWeight: 800,
                  fontFamily,
                  color: 'black',
                  textAlign: 'center',
                }}>
                  {row.value}
                </span>
              </div>
            );
          }

          if (row.type === 'barcode') {
            return (
              <div key={`bc-${index}`} style={{
                width: '100%',
                padding: '6px 0',
                display: 'flex',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}>
                <Barcode value={row.payload} format="CODE128" width={1.2} height={40} displayValue={true} margin={0} />
              </div>
            );
          }

          const qrSrc = qrImages[row.payload];
          return qrSrc ? (
            <div key={`qr-${index}`} style={{ width: '100%', padding: '4px 0 6px', textAlign: 'left', display: 'flex', justifyContent: 'flex-start', paddingLeft: '8px' }}>
              <img
                src={qrSrc}
                alt="UPI QR"
                style={{ width: '92%', maxWidth: '220px', height: 'auto', imageRendering: 'pixelated', display: 'block' }}
              />
            </div>
          ) : (
            <pre key={`qr-fallback-${index}`} style={{
              margin: 0,
              padding: 0,
              fontSize,
              fontFamily,
              whiteSpace: 'pre',
              color: 'black',
              fontWeight: 700,
              lineHeight: lh,
              textAlign: 'left',
            }}>
              [QR LOADING]
            </pre>
          );
        })}
      </div>
    </div>
  );
}
