import { useEffect } from 'react';

export function PrintReceiptView({ text }: { text: string }) {
  useEffect(() => {
    // Give react a tiny bit of time to render
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: 'white', padding: '10px', boxSizing: 'border-box' }}>
      <pre style={{ margin: 0, padding: 0, fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: 'black' }}>
        {text}
      </pre>
    </div>
  );
}
