import { useEffect, useState } from 'react';

function sanitizeHtml(html: string): string {
  // Strip script blocks
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip dangerous tags (iframe, object, embed, svg, meta, link, form, input, etc.)
  html = html.replace(/<\/?(?:iframe|object|embed|svg|meta|link|base|form|input|button|textarea|select|option|optgroup|label|fieldset|legend|datalist|output|progress|meter|details|summary|dialog|template|slot|canvas|map|area|math|noscript|noembed|plaintext|xmp)\b[^>]*>/gi, '');
  // Strip event handlers (onclick, onerror, etc.) with any quote style including backticks
  html = html.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]+)/gi, '');
  // Strip javascript:/data:/vbscript: protocol URLs
  html = html.replace(/(?:javascript|data|vbscript):/gi, '');
  return html;
}

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
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}
    />
  );
}
