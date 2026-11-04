import type React from 'react';
import { FileSpreadsheet, Copy } from 'lucide-react';
import clsx from 'clsx';

export interface UseAiMessageFormattingContext {
  handleCopyTableCSV: (tableMarkdown: string) => void;
}

/** Renders assistant message text: headings, lists, tables (with CSV copy) and inline bold / italic / code. */
export function useAiMessageFormatting(ctx: UseAiMessageFormattingContext) {
  const { handleCopyTableCSV } = ctx;
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      const fullTableString = tableBuffer.join('\n');
      const rows = tableBuffer.map((r) =>
        r.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1)
      );

      const headers = rows[0] || [];
      const alignRow = rows[1] || [];
      const bodyRows = rows.slice(2);

      // Determine column alignments so headers and cells align properly
      const colAlignments = headers.map((h, i) => {
        const alignCell = (alignRow[i] || '').trim();
        if (alignCell.startsWith(':') && alignCell.endsWith(':')) return 'center';
        if (alignCell.endsWith(':')) return 'right';
        if (alignCell.startsWith(':')) return 'left';
        // Auto-detect based on body cells or header name
        let hasNumberOrCurrency = false;
        for (const r of bodyRows) {
          const val = (r[i] || '').replace(/\*+/g, '').trim();
          if (/^(?:[₹$]|AED)?\s*[\d,]+(\.\d+)?(\s*[a-zA-Z/%]+)?$/.test(val)) {
            hasNumberOrCurrency = true;
            break;
          }
        }
        if (hasNumberOrCurrency || /amount|total|price|rate|cost|balance|due|qty|quantity/i.test(h)) {
          return 'right';
        }
        return 'left';
      });

      elements.push(
        <div key={`table-${elements.length}`} className="my-3 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-xs w-full">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Table Data</span>
            </div>
            <button
              onClick={() => handleCopyTableCSV(fullTableString)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-0.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Copy as CSV"
            >
              <Copy className="w-3 h-3" />
              <span>Copy CSV</span>
            </button>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 font-semibold">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={clsx(
                        "px-3.5 py-2.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-gray-500",
                        colAlignments[i] === 'right' ? 'text-right' : colAlignments[i] === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {parseInlineFormatting(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className={clsx(rIdx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-gray-50/30 dark:bg-zinc-800/20', 'hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors')}>
                    {row.map((cell, cIdx) => {
                      const isRight = colAlignments[cIdx] === 'right';
                      const isCenter = colAlignments[cIdx] === 'center';
                      return (
                        <td
                          key={cIdx}
                          className={clsx(
                            'px-3.5 py-2.5 whitespace-nowrap text-gray-800 dark:text-gray-200 font-medium',
                            isRight && 'tabular-nums font-mono text-right',
                            isCenter && 'text-center',
                            !isRight && !isCenter && 'text-left'
                          )}
                        >
                          {parseInlineFormatting(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      tableBuffer = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        tableBuffer.push(trimmed);
        return;
      } else if (tableBuffer.length > 0) {
        flushTable();
      }

      if (trimmed.startsWith('### ')) {
        elements.push(
          <div key={index} className="mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-emerald-600" />
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">{parseInlineFormatting(trimmed.replace('### ', ''))}</h3>
          </div>
        );
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        elements.push(
          <div key={index} className="flex items-start gap-2.5 my-1.5 pl-1 text-xs md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
            <span>{parseInlineFormatting(trimmed.substring(2))}</span>
          </div>
        );
      } else if (trimmed === '') {
        elements.push(<div key={index} className="h-1.5" />);
      } else {
        elements.push(
          <p key={index} className="text-xs md:text-sm text-gray-700 dark:text-gray-300 my-1 leading-relaxed">
            {parseInlineFormatting(trimmed)}
          </p>
        );
      }
    });

    if (tableBuffer.length > 0) flushTable();
    return elements;
  };

  const parseInlineFormatting = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-gray-500">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 border border-gray-200 dark:border-zinc-700">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return { renderFormattedContent };
}
