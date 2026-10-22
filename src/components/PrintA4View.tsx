import { useEffect, useState } from 'react';
import { hasBridge, isDesktopRuntime } from '../data/client';
import { printingApi } from '../data/printing';

function sanitizeHtml(html: string): string {
  // Strip script blocks
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip dangerous tags (iframe, object, embed, svg, base, form, input, etc.) — PRESERVE meta, link, and style for page formatting!
  html = html.replace(/<\/?(?:iframe|object|embed|svg|base|form|input|button|textarea|select|option|optgroup|label|fieldset|legend|datalist|output|progress|meter|details|summary|dialog|template|slot|canvas|map|area|math|noscript|noembed|plaintext|xmp)\b[^>]*>/gi, '');
  // Strip event handlers (onclick, onerror, etc.) with any quote style including backticks
  html = html.replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]+)/gi, '');
  // Strip javascript:/data:/vbscript: protocol URLs
  html = html.replace(/(?:javascript|data|vbscript):/gi, '');
  return html;
}

export function PrintA4View() {
  const [htmlContent, setHtmlContent] = useState('');

  useEffect(() => {
    // Remove dark theme class and force white background during A4 print/PDF rendering
    document.documentElement.classList.remove('dark');
    document.documentElement.style.backgroundColor = '#ffffff';
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.color = '#000000';

    if (isDesktopRuntime() && hasBridge('getA4Html')) {
      printingApi.getA4Html().then((html: string) => {
        if (html) setHtmlContent(html);
      });
    }
  }, []);

  useEffect(() => {
    if (!htmlContent) return;
    const timer = setTimeout(() => {
      if (isDesktopRuntime() && hasBridge('printReady')) {
        printingApi.printReady();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [htmlContent]);

  if (!htmlContent) return null;

  return (
    <>
      <style>{`
        html, body, #root {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #000000 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }
        tfoot {
          display: table-row-group !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        @media print {
          html, body, #root {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }
          tfoot {
            display: table-row-group !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
      <div
        style={{ width: '100%', backgroundColor: '#ffffff', color: '#000000', padding: 0, margin: 0 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}
      />
    </>
  );
}
