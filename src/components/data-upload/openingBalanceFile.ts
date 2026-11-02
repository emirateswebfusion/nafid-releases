/**
 * Reads an opening balance sheet as a grid of cells. Billing exports often start with title rows, so the header is the
 * first row with both a name column and a balance column. Blank balances mean nothing to carry forward, and the export's
 * own Total row is left out and returned as `fileTotal` to check the rows against.
 */
const NAME_HEADERS = ['account name', 'customer name', 'supplier name', 'party name', 'name'];
const AMOUNT_HEADERS = ['balance', 'opening balance', 'closing balance', 'amount'];

const clean = (cell: unknown) => String(cell ?? '').trim();
const toAmount = (cell: unknown) => (typeof cell === 'number' ? cell : Number(clean(cell).replace(/,/g, '')));

export interface OpeningFileRow { name: string; amount: number; error?: string }

export function parseOpeningBalanceGrid(grid: unknown[][]): { rows: OpeningFileRow[]; fileTotal: number | null; error?: string } {
  const headerIndex = grid.findIndex((row) => {
    const cells = row.map((c) => clean(c).toLowerCase());
    return NAME_HEADERS.some((h) => cells.includes(h)) && AMOUNT_HEADERS.some((h) => cells.includes(h));
  });
  if (headerIndex < 0) return { rows: [], fileTotal: null, error: 'No header row with a name column and a Balance column was found.' };

  const headers = grid[headerIndex].map((c) => clean(c).toLowerCase());
  const nameCol = headers.findIndex((h) => NAME_HEADERS.includes(h));
  const amountCol = headers.findIndex((h) => AMOUNT_HEADERS.includes(h));
  const rows: OpeningFileRow[] = [];
  let fileTotal: number | null = null;
  for (const row of grid.slice(headerIndex + 1)) {
    const name = clean(row[nameCol]);
    const raw = clean(row[amountCol]);
    if (!raw) continue;
    const amount = toAmount(row[amountCol]);
    if (name.toLowerCase() === 'total') {
      fileTotal = Number.isFinite(amount) ? amount : null;
      continue;
    }
    if (!name) rows.push({ name, amount: 0, error: 'Name is required' });
    else if (!Number.isFinite(amount)) rows.push({ name, amount: 0, error: `Balance "${raw}" is not a number` });
    else if (amount !== 0) rows.push({ name, amount });
  }
  return { rows, fileTotal };
}
