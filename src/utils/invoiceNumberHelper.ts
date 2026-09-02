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
