import { useEffect, useState } from 'react';

const printStyles = `
  @page { margin: 0; size: auto; }
  body { margin: 0; padding: 0; }
`;

export function PrintReceiptView({ text }: { text: string }) {
  const [receiptText, setReceiptText] = useState(text || '');

  useEffect(() => {
    if (!text && window.electronAPI?.getReceiptText) {
      window.electronAPI.getReceiptText().then((t: string) => {
        if (t) setReceiptText(t);
      });
    }
  }, [text]);

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
        fontSize: '10pt',
        fontFamily: '"Courier New", "Lucida Console", monospace',
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
