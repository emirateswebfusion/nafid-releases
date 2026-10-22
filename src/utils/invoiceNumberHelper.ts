export function getNextOffsetInvoiceNumber(baseNum: string, existingNums: (string | undefined | null)[]): string {
  if (!baseNum) return '';
  const match = baseNum.match(/^(.*?[^\d])(\d+)$/);
  if (!match) return baseNum;

  const prefix = match[1];
  const numStr = match[2];
  const padLen = numStr.length;
  let baseVal = parseInt(numStr, 10);

  const used = new Set(
    existingNums
      .map(n => {
        if (!n) return null;
        const m = n.match(/^(.*?[^\d])(\d+)$/);
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
