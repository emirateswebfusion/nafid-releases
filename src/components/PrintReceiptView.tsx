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

const printStyles = `
  @page { margin: 0; size: auto; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    background-color: white;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
  }
  @media print {
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      display: flex;
      justify-content: flex-start;
      align-items: flex-start;
    }
  }
`;

type ReceiptRow =
  | { type: 'text'; value: string; lhMultiplier: number }
  | { type: 'qr'; payload: string }
  | { type: 'barcode'; payload: string };

function parseReceiptToRows(input: string): ReceiptRow[] {
  const lines = input.split('\n');
  const rows: ReceiptRow[] = [];

  lines.forEach((line) => {
    // If line is empty and it's the last line, skip it
    if (line === '' && rows.length === lines.length - 1) return;

    if (line.includes('[[QR:')) {
      const match = line.match(/\[\[QR:([^\]]+)\]\]/);
      if (match) {
        rows.push({ type: 'qr', payload: match[1] });
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
  const [fontFamily, setFontFamily] = useState('"Courier New", monospace');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

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
      } catch {
        // fallback to default
      }
    })();
  }, []);

  useEffect(() => {
    if (!receiptText || !isQrReady) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 100);
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
  const lh = isBillStyle ? 0.98 : 1.2;

  return (
    <div style={{ width: '100%', backgroundColor: 'white', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <style>{printStyles}</style>
      <div style={{
        padding: isBillStyle ? '6px 6px' : '4px 6px',
        width: isBillStyle ? 'max-content' : '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        border: isBillStyle ? '2.5px solid black' : 'none',
        boxSizing: 'border-box',
        backgroundColor: 'white',
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
                return <hr key={`sep-${index}`} style={{ border: 'none', borderTop: '1.5px solid black', margin: '2px -6px', padding: 0 }} />;
              }
              if (firstChar === '│' && lastChar === '│') {
                displayValue = displayValue.substring(1, displayValue.length - 1);
              }
            }
            return (
              <pre key={`text-${index}`} style={{
                margin: 0,
                padding: 0,
                fontSize: '8.2pt',
                fontFamily,
                whiteSpace: 'pre',
                color: 'black',
                fontWeight: 700,
                lineHeight: lh * row.lhMultiplier,
                textAlign: 'left',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0px',
              }}>
                {displayValue}
              </pre>
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
              fontSize: '8.2pt',
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
