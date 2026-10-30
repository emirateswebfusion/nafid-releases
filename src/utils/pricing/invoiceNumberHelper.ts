import { isUaeStore } from '../localization/storeProfile';
export function getNextOffsetInvoiceNumber(baseNum: string, existingNums: (string | undefined | null)[]): string {
  if (!baseNum) return '';
  const match = baseNum.match(/^(.*?)(\d+)$/);
  if (!match) return baseNum;

  const prefix = match[1];
  const numStr = match[2];
  const padLen = numStr.length;
  let baseVal = parseInt(numStr, 10);

  const used = new Set(
    existingNums
      .map(n => {
        if (!n) return null;
        const m = n.match(/^(.*?)(\d+)$/);
        if (m && m[1] === prefix) {
          return parseInt(m[2], 10);
        }
        return null;
      })
      .filter((v): v is number => v !== null)
  );

  while (used.has(baseVal)) {
    baseVal++;
  }

  return `${prefix}${String(baseVal).padStart(padLen, '0')}`;
}

/** All digits of a document number joined: `SCR-0012/B` → `0012`. Used for loose number search. */
export function getNumericPart(value: string): string {
  return (value.match(/\d+/g) || []).join('');
}

/**
 * Loose document-number match used by deduction/return search: true when the query's digits
 * appear in the candidate's digits. A query without digits never matches.
 */
export function matchesDocumentNumber(candidate: string, query: string): boolean {
  const q = getNumericPart(query);
  return q.length > 0 && getNumericPart(candidate).includes(q);
}

/**
 * Number as shown for a GST invoice in single-series mode: `GST-` is prefixed unless the number already carries it
 * (the default GST counter prefix is `GST-`, which used to show as `GST-GST-001`). Other invoice types, three-series
 * mode and empty numbers are returned unchanged.
 */
export function displayInvoiceNumber(num: string, invoiceType: string, enableThreeInvoiceSeries: boolean): string {
  if (isUaeStore() || !num || invoiceType !== 'GST' || enableThreeInvoiceSeries) return num;
  return num.toUpperCase().startsWith('GST-') ? num : `GST-${num}`;
}
