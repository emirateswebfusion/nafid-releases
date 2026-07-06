import { useEffect, useState } from 'react';
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
  body { margin: 0; padding: 0; }
`;

export function PrintReceiptView({ text }: { text: string }) {
  const [receiptText, setReceiptText] = useState(text || '');
  const [fontFamily, setFontFamily] = useState('"Courier New", monospace');

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
    if (!receiptText) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [receiptText]);

  if (!receiptText) return null;

  return (
    <div style={{ width: '100%', backgroundColor: 'white', padding: 0, margin: 0 }}>
      <style>{printStyles}</style>
      <pre style={{
        margin: 0,
        padding: '4px 0',
        fontSize: '9pt',
        fontFamily,
        whiteSpace: 'pre',
        color: 'black',
        fontWeight: 700,
        lineHeight: 1.2,
      }}>
        {receiptText}
      </pre>
    </div>
  );
}
