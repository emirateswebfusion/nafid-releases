import { calculateLedgerStatement, type LedgerEntryData, type StatementPeriodFilter } from '../../utils/print/partyLedgerPdfGenerator';

/** Closing balances include the advance brought forward before the selected period. */
export function calculateLedgerBalances(entries: LedgerEntryData[], period: StatementPeriodFilter, timeZone: string) {
  const party = { party_id: '', name: '' };
  const balance = (type: 'GST' | 'ESTIMATE') => calculateLedgerStatement(
    entries.filter(entry => (entry.balance_type || 'GST') === type), period, party, undefined, timeZone
  ).closingBalance;
  return { gst: balance('GST'), estimate: balance('ESTIMATE') };
}
