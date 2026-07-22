import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useAuthStore } from '../store/authStore';

const FONT_MAP: Record<string, string> = {
  courier: '"Courier New", monospace',
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
    justify-content: center;
  }
  @media print {
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      display: flex;
      justify-content: center;
    }
  }
`;

const QR_MARKER_REGEX = /\[\[QR:([^\]]+)\]\]/g;

type ReceiptSegment =
  | { type: 'text'; value: string }
  | { type: 'qr'; payload: string };

function splitReceiptByQrMarkers(input: string): ReceiptSegment[] {
  const segments: ReceiptSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = QR_MARKER_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'qr', payload: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', value: input }];
}

export function PrintReceiptView({ text }: { text: string }) {
  const [receiptText, setReceiptText] = useState(text || '');
  const [fontFamily, setFontFamily] = useState('"Courier New", monospace');
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const qrPayloads = useMemo(
    () => Array.from(new Set([...receiptText.matchAll(QR_MARKER_REGEX)].map((m) => m[1]).filter(Boolean))),
    [receiptText]
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

  const segments = splitReceiptByQrMarkers(receiptText);

  return (
    <div style={{ width: '100%', backgroundColor: 'white', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{printStyles}</style>
      <div style={{ padding: '4px 0', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return (
              <pre key={`text-${index}`} style={{
                margin: '0 auto',
                padding: 0,
                fontSize: '9pt',
                fontFamily,
                whiteSpace: 'pre',
                color: 'black',
                fontWeight: 700,
                lineHeight: 1.2,
                textAlign: 'center',
              }}>
                {segment.value}
              </pre>
            );
          }

          const qrSrc = qrImages[segment.payload];
          return qrSrc ? (
            <div key={`qr-${index}`} style={{ width: '100%', padding: '4px 0 6px', textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
              <img
                src={qrSrc}
                alt="UPI QR"
                style={{ width: '92%', maxWidth: '220px', height: 'auto', imageRendering: 'pixelated', display: 'block', margin: '0 auto' }}
              />
            </div>
          ) : (
            <pre key={`qr-fallback-${index}`} style={{
              margin: '0 auto',
              padding: 0,
              fontSize: '9pt',
              fontFamily,
              whiteSpace: 'pre',
              color: 'black',
              fontWeight: 700,
              lineHeight: 1.2,
              textAlign: 'center',
            }}>
              [QR LOADING]
            </pre>
          );
        })}
      </div>
    </div>
  );
}
