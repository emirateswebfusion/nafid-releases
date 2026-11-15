// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { calculateLedgerBalances } from '../../src/components/party/ledgerBalances';
import { calculateLedgerStatement, type LedgerEntryData } from '../../src/utils/print/partyLedgerPdfGenerator';
import { PartyBalanceCards, type PartyBalanceCardsProps } from '../../src/components/party/views/ledger/PartyBalanceCards';
import { TERMINOLOGY_PRESETS } from '../../src/store/terminologyStore';

afterEach(cleanup);
const entry = (id: string, date: string, credit: number, debit: number, type = 'GST'): LedgerEntryData => ({ ledger_id: id, party_id: 'customer', transaction_date: date, description: id, credit_amount: credit, debit_amount: debit, running_balance: 0, balance_type: type });
const period = { startDate: '2026-11-04', endDate: '2026-11-04' };
const labels = TERMINOLOGY_PRESETS.SIMPLE.labels;
const party = { party_id: 'customer', name: 'Advance customer', balance: -500 } as PartyBalanceCardsProps['selectedParty'];

describe('ledger balance direction', () => {
  it.each(['GST', 'ESTIMATE'])('keeps a %s customer advance payable after a date filter', type => {
    const entries = [entry('advance', '2026-11-03T06:00:00Z', 0, 600, type), entry('sale', '2026-11-04T06:00:00Z', 100, 0, type), entry('future', '2026-11-05T06:00:00Z', 1000, 0, type)];
    const balances = calculateLedgerBalances(entries, period, 'Asia/Kolkata');
    expect(type === 'GST' ? balances.gst : balances.estimate).toBe(-500);
    const props: PartyBalanceCardsProps = { activeGstBal: balances.gst, activeEstimateBal: balances.estimate, enablePartyGst: type === 'GST', enablePartyEstimate: type === 'ESTIMATE', getPartyBalance: () => -500, ledgerBalanceFilter: 'ALL', ledgerStartDate: period.startDate, ledgerEndDate: period.endDate, selectedParty: party, setLedgerBalanceFilter: () => {}, statementData: calculateLedgerStatement(entries, period, party, labels, 'Asia/Kolkata'), tLabels: labels };
    render(<PartyBalanceCards {...props} />);
    expect(screen.getByText("You'll Give")).toBeTruthy();
    expect(screen.queryByText("You'll Get")).toBeNull();
    expect(screen.getByText(/−[^\d]*500\.00/)).toBeTruthy();
  });
  it('includes opening balances when no period transactions exist and ignores deleted rows', () => {
    const entries = [entry('advance', '2026-11-03T06:00:00Z', 0, 500), { ...entry('deleted', '2026-11-04T06:00:00Z', 1000, 0), is_deleted: true }];
    expect(calculateLedgerBalances(entries, period, 'Asia/Kolkata')).toEqual({ gst: -500, estimate: 0 });
  });
  it('keeps receivables positive, settled balances zero, and respects the shop timezone', () => {
    const entries = [entry('opening', '2026-11-03T06:00:00Z', 600, 0), entry('payment', '2026-11-03T19:00:00Z', 0, 100), entry('estimate', '2026-11-04T06:00:00Z', 0, 200, 'ESTIMATE')];
    expect(calculateLedgerBalances(entries, period, 'Asia/Kolkata')).toEqual({ gst: 500, estimate: -200 });
    expect(calculateLedgerBalances([], period, 'Asia/Kolkata')).toEqual({ gst: 0, estimate: 0 });
  });
});
