import { useEffect, useState } from 'react';

export function PrintA4View() {
  const [htmlContent, setHtmlContent] = useState('');

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getA4Html) {
      window.electronAPI.getA4Html().then((html: string) => {
        if (html) setHtmlContent(html);
      });
    }
  }, []);

  useEffect(() => {
    if (!htmlContent) return;
    const timer = setTimeout(() => {
      if (window.electronAPI && window.electronAPI.printReady) {
        window.electronAPI.printReady();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [htmlContent]);

  if (!htmlContent) return null;

  return (
    <div
      style={{ width: '100%', backgroundColor: 'white', padding: 0, margin: 0 }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
