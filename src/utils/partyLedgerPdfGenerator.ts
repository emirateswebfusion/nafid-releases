import { parseUTCDate } from './receiptGenerator';
import { getStoreTimezone } from './timezoneHelper';
import type { TerminologyLabels } from '../store/terminologyStore';

export const DEFAULT_TERMINOLOGY_LABELS: TerminologyLabels = {
  receivable: "You'll Get",
  payable: "You'll Give",
  received: "Got Cash",
  paid: "Gave Cash",
  credit: "Credit (+)",
  debit: "Debit (-)",
  receivableSub: "Amount owed to you",
  payableSub: "Amount you owe",
};

export interface LedgerEntryData {
  ledger_id: string;
  party_id: string;
  transaction_date: string;
  description: string;
  credit_amount: number;
  debit_amount: number;
  running_balance: number;
  balance_type?: string;
  payment_method?: string;
  reference_number?: string;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number | boolean;
}

export interface PartyData {
  party_id: string;
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
  balance?: number;
  current_balance?: number;
  party_type?: string;
  custom_category?: string | null;
}

export interface StatementPeriodFilter {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface StatementMonthGroup {
  monthKey: string;      // e.g. "2026-02"
  monthTitle: string;    // e.g. "February 2026"
  entries: LedgerEntryData[];
  monthCredit: number;
  monthDebit: number;
}

export interface StatementReconciliation {
  openingBalance: number;
  periodCredit: number;
  periodDebit: number;
  totalCredit: number;
  totalDebit: number;
  closingBalance: number;
  entryCount: number;
  creditCount: number;
  debitCount: number;
  periodLabel: string;
  startDateFormatted: string;
  endDateFormatted: string;
  entries: LedgerEntryData[];
  monthGroups: StatementMonthGroup[];
  obIndicator: string;
  closingIndicator: string;
  closingStatusText: string;
}

export interface PartyLedgerPdfOptions {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopGstin?: string;
  shopState?: string;
  shopLogoUrl?: string;
  party: PartyData;
  filter: StatementPeriodFilter;
  terminology: TerminologyLabels;
  timezone?: string;
  showBalanceType?: boolean;
}

/**
 * Format number in Indian currency style: e.g. 13,95,252.00
 */
export function formatIndianCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
}

/**
 * Extract YYYY-MM-DD in the store timezone for accurate boundary comparison
 */
export function getLocalDateString(dateInput: string | Date, tz: string): string {
  try {
    const d = typeof dateInput === 'string' ? parseUTCDate(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    return parts; // Returns 'YYYY-MM-DD'
  } catch {
    if (typeof dateInput === 'string' && dateInput.length >= 10) {
      return dateInput.slice(0, 10);
    }
    return '';
  }
}

/**
 * Single source of truth for Statement Calculations & Reconciliation
 */
export function calculateLedgerStatement(
  allEntries: LedgerEntryData[],
  filter: StatementPeriodFilter,
  party: PartyData,
  terminology: TerminologyLabels = DEFAULT_TERMINOLOGY_LABELS,
  timeZone = getStoreTimezone()
): StatementReconciliation {
  const term = terminology || DEFAULT_TERMINOLOGY_LABELS;
  const activeEntries = (allEntries || []).filter(e => !e.is_deleted);

  // Sort strictly in chronological order (Oldest first)
  const sorted = [...activeEntries].sort((a, b) => {
    const timeA = new Date(a.transaction_date).getTime();
    const timeB = new Date(b.transaction_date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const catA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const catB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return catA - catB;
  });

  const startDate = filter.startDate?.trim() || '';
  const endDate = filter.endDate?.trim() || '';

  let openingBalance = 0;
  const periodEntries: LedgerEntryData[] = [];

  for (const entry of sorted) {
    const entryDate = getLocalDateString(entry.transaction_date, timeZone);
    const credit = Number(entry.credit_amount) || 0;
    const debit = Number(entry.debit_amount) || 0;

    if (startDate && entryDate < startDate) {
      // Prior to start of period -> accumulates into opening balance
      openingBalance += (credit - debit);
    } else if (endDate && entryDate > endDate) {
      // After end of period -> excluded
      continue;
    } else {
      // Inside period
      periodEntries.push(entry);
    }
  }

  openingBalance = Math.round(openingBalance * 100) / 100;

  let periodCredit = 0;
  let periodDebit = 0;
  let creditCount = 0;
  let debitCount = 0;

  // Compute progressive running balance for each period entry starting from openingBalance
  let currentRunning = openingBalance;
  const calculatedEntries: LedgerEntryData[] = periodEntries.map(entry => {
    const c = Number(entry.credit_amount) || 0;
    const d = Number(entry.debit_amount) || 0;
    if (c > 0) {
      periodCredit += c;
      creditCount++;
    }
    if (d > 0) {
      periodDebit += d;
      debitCount++;
    }
    currentRunning += (c - d);
    currentRunning = Math.round(currentRunning * 100) / 100;

    return {
      ...entry,
      credit_amount: c,
      debit_amount: d,
      running_balance: currentRunning,
    };
  });

  periodCredit = Math.round(periodCredit * 100) / 100;
  periodDebit = Math.round(periodDebit * 100) / 100;
  const closingBalance = Math.round((openingBalance + periodCredit - periodDebit) * 100) / 100;

  // Format month groups for visual ledger hierarchy
  const monthGroupsMap = new Map<string, LedgerEntryData[]>();
  for (const entry of calculatedEntries) {
    const d = parseUTCDate(entry.transaction_date);
    const key = !isNaN(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : 'other';
    if (!monthGroupsMap.has(key)) {
      monthGroupsMap.set(key, []);
    }
    monthGroupsMap.get(key)!.push(entry);
  }

  const monthGroups: StatementMonthGroup[] = [];
  for (const [key, items] of monthGroupsMap.entries()) {
    let title = 'Transactions';
    if (key !== 'other') {
      const [y, m] = key.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      title = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    const mCredit = items.reduce((sum, item) => sum + (Number(item.credit_amount) || 0), 0);
    const mDebit = items.reduce((sum, item) => sum + (Number(item.debit_amount) || 0), 0);
    monthGroups.push({
      monthKey: key,
      monthTitle: title,
      entries: items,
      monthCredit: Math.round(mCredit * 100) / 100,
      monthDebit: Math.round(mDebit * 100) / 100,
    });
  }

  // Formatting date range labels
  const formatDateLabel = (dStr: string) => {
    if (!dStr) return '';
    try {
      const d = parseUTCDate(dStr);
      return d.toLocaleDateString('en-IN', { timeZone, day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dStr;
    }
  };

  const startDateFormatted = startDate ? formatDateLabel(startDate) : '';
  const endDateFormatted = endDate ? formatDateLabel(endDate) : '';

  let periodLabel = '';
  if (startDate && endDate) {
    periodLabel = `${startDateFormatted} - ${endDateFormatted}`;
  } else if (startDate) {
    periodLabel = `From ${startDateFormatted}`;
  } else if (endDate) {
    periodLabel = `Up to ${endDateFormatted}`;
  } else if (sorted.length > 0) {
    const firstDate = getLocalDateString(sorted[0].transaction_date, timeZone);
    const lastDate = getLocalDateString(sorted[sorted.length - 1].transaction_date, timeZone);
    periodLabel = `${formatDateLabel(firstDate)} - ${formatDateLabel(lastDate)}`;
  } else {
    const today = getLocalDateString(new Date(), timeZone);
    periodLabel = `As of ${formatDateLabel(today)}`;
  }

  // Label directions
  const getBalIndicator = (bal: number) => {
    if (bal > 0) return 'Dr'; // Receivable
    if (bal < 0) return 'Cr'; // Payable
    return '';
  };

  const obIndicator = getBalIndicator(openingBalance);
  const closingIndicator = getBalIndicator(closingBalance);

  let closingStatusText = 'Settled';
  const partyName = party.name || 'Party';
  if (closingBalance > 0) {
    closingStatusText = `${term.receivable || "You'll Get"} (${partyName} will pay)`;
  } else if (closingBalance < 0) {
    closingStatusText = `${term.payable || "You'll Give"} (You will pay ${partyName})`;
  }

  return {
    openingBalance,
    periodCredit,
    periodDebit,
    totalCredit: periodCredit,
    totalDebit: periodDebit,
    closingBalance,
    entryCount: calculatedEntries.length,
    creditCount,
    debitCount,
    periodLabel,
    startDateFormatted,
    endDateFormatted,
    entries: calculatedEntries,
    monthGroups,
    obIndicator,
    closingIndicator,
    closingStatusText,
  };
}

/**
 * Generate complete print-ready HTML for the Party Ledger PDF Statement
 */
export function generatePartyLedgerHtml(options: PartyLedgerPdfOptions): string {
  const {
    shopName,
    shopAddress,
    shopPhone,
    shopEmail,
    shopGstin,
    shopState,
    shopLogoUrl,
    party,
    filter,
    terminology,
    timezone = getStoreTimezone(),
  } = options;

  const recon = calculateLedgerStatement(
    (party as any).ledger || [],
    filter,
    party,
    terminology,
    timezone
  );

  const nowFormatted = new Date().toLocaleString('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Determine dynamic column headers based on terminology
  const creditColHeader = terminology.credit || terminology.paid || 'Credit (+) / Sale';
  const debitColHeader = terminology.debit || terminology.received || 'Debit (-) / Payment';

  // Format party type subtitle
  const pType = (party.party_type || 'CUSTOMER').toUpperCase();
  const partyTypeBadge = pType === 'CUSTOMER' ? 'Customer' : pType === 'SUPPLIER' ? 'Supplier' : pType === 'STAFF' ? 'Staff' : party.custom_category || 'Party';

  // Build Table Rows
  const renderEntriesHtml = () => {
    if (recon.entries.length === 0) {
      return `
        <tr>
          <td colspan="5" style="padding: 30px; text-align: center; color: #64748b; font-size: 11pt; font-style: italic; background: #ffffff;">
            No transactions found for the selected period (${recon.periodLabel}).
          </td>
        </tr>
      `;
    }

    const rows: string[] = [];
    const isMultiMonth = recon.monthGroups.length > 1;

    for (const group of recon.monthGroups) {
      if (isMultiMonth) {
        rows.push(`
          <tr class="month-header-row">
            <td colspan="5" style="padding: 7px 10px; background: #f1f5f9; font-weight: 800; font-size: 9pt; color: #1e293b; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px;">
              📅 ${group.monthTitle}
            </td>
          </tr>
        `);
      }

      for (const entry of group.entries) {
        const d = parseUTCDate(entry.transaction_date);
        const dateFormatted = !isNaN(d.getTime())
          ? d.toLocaleDateString('en-IN', { timeZone: timezone, day: '2-digit', month: 'short' })
          : entry.transaction_date.slice(0, 10);
        const yearFormatted = !isNaN(d.getTime()) ? d.getFullYear() : '';

        const refText = entry.reference_number?.trim() || '';
        const payMethod = entry.payment_method?.trim() || '';

        const cAmt = Number(entry.credit_amount) || 0;
        const dAmt = Number(entry.debit_amount) || 0;
        const running = Number(entry.running_balance) || 0;

        const balInd = running > 0 ? (terminology.receivable ? terminology.receivable : 'Dr') : running < 0 ? (terminology.payable ? terminology.payable : 'Cr') : '';
        const balColor = running > 0 ? '#b91c1c' : running < 0 ? '#15803d' : '#475569';

        rows.push(`
          <tr class="tx-row">
            <td style="padding: 7px 9px; font-size: 8.5pt; color: #334155; font-weight: 600; white-space: nowrap; border-bottom: 1px solid #e2e8f0; vertical-align: middle;">
              ${dateFormatted} ${!isMultiMonth ? `<span style="color:#94a3b8; font-weight:normal;">${yearFormatted}</span>` : ''}
            </td>
            <td style="padding: 7px 9px; font-size: 8.5pt; color: #0f172a; border-bottom: 1px solid #e2e8f0; vertical-align: middle;">
              <div style="font-weight: 600; line-height: 1.35;">${entry.description || 'Transaction'}</div>
              <div style="display: flex; gap: 6px; margin-top: 2px; align-items: center; flex-wrap: wrap;">
                ${refText ? `<span style="display:inline-block; font-family: monospace; font-size: 7.5pt; font-weight: 700; background: #e2e8f0; color: #334155; padding: 1px 5px; border-radius: 3px; border: 1px solid #cbd5e1;">#${refText}</span>` : ''}
                ${(options.showBalanceType && entry.balance_type) ? `<span style="display:inline-block; font-size: 7.5pt; font-weight: 700; background: ${entry.balance_type === 'ESTIMATE' ? '#f5f3ff' : '#f0f9ff'}; color: ${entry.balance_type === 'ESTIMATE' ? '#6d28d9' : '#0369a1'}; padding: 1px 5px; border-radius: 3px; border: 1px solid ${entry.balance_type === 'ESTIMATE' ? '#ddd6fe' : '#bae6fd'}; text-transform: uppercase;">${entry.balance_type}</span>` : ''}
                ${payMethod ? `<span style="display:inline-block; font-size: 7.5pt; font-weight: 600; background: #f8fafc; color: #475569; padding: 1px 5px; border-radius: 3px; border: 1px solid #e2e8f0;">${payMethod}</span>` : ''}
              </div>
            </td>
            <td style="padding: 7px 9px; text-align: right; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 700; font-size: 9pt; border-bottom: 1px solid #e2e8f0; vertical-align: middle; ${cAmt > 0 ? 'background: #fef2f2; color: #991b1b;' : 'color: #94a3b8;'}">
              ${cAmt > 0 ? `₹${formatIndianCurrency(cAmt)}` : '—'}
            </td>
            <td style="padding: 7px 9px; text-align: right; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 700; font-size: 9pt; border-bottom: 1px solid #e2e8f0; vertical-align: middle; ${dAmt > 0 ? 'background: #f0fdf4; color: #166534;' : 'color: #94a3b8;'}">
              ${dAmt > 0 ? `₹${formatIndianCurrency(dAmt)}` : '—'}
            </td>
            <td style="padding: 7px 9px; text-align: right; font-weight: 800; font-size: 9pt; color: ${balColor}; border-bottom: 1px solid #e2e8f0; vertical-align: middle;">
              ₹${formatIndianCurrency(Math.abs(running))}
              ${balInd ? `<span style="font-size: 7.5pt; font-weight: 800; margin-left: 3px; text-transform: uppercase;">${balInd}</span>` : ''}
            </td>
          </tr>
        `);
      }

      if (isMultiMonth) {
        rows.push(`
          <tr class="month-total-row" style="background: #f8fafc; font-weight: 700; font-size: 8.5pt;">
            <td colspan="2" style="padding: 6px 9px; text-align: right; color: #475569; border-bottom: 1px solid #cbd5e1;">
              ${group.monthTitle} Total:
            </td>
            <td style="padding: 6px 9px; text-align: right; color: #991b1b; border-bottom: 1px solid #cbd5e1; background: #fff1f2;">
              ${group.monthCredit > 0 ? `₹${formatIndianCurrency(group.monthCredit)}` : '—'}
            </td>
            <td style="padding: 6px 9px; text-align: right; color: #166534; border-bottom: 1px solid #cbd5e1; background: #f0fdf4;">
              ${group.monthDebit > 0 ? `₹${formatIndianCurrency(group.monthDebit)}` : '—'}
            </td>
            <td style="padding: 6px 9px; border-bottom: 1px solid #cbd5e1;"></td>
          </tr>
        `);
      }
    }

    return rows.join('');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="page-size" content="A4">
  <meta name="page-orientation" content="portrait">
  <title>${party.name} - Ledger Statement</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 12mm 10mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }
    .statement-wrapper {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
    }
    /* Brand Bar at Top */
    .brand-bar {
      background: #0f3d75;
      color: #ffffff;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-radius: 4px 4px 0 0;
    }
    .brand-left h2 {
      margin: 0;
      font-size: 13pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .brand-left p {
      margin: 2px 0 0 0;
      font-size: 7.5pt;
      opacity: 0.9;
    }
    .brand-right {
      text-align: right;
    }
    .brand-badge {
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      background: rgba(255,255,255,0.18);
      padding: 3px 8px;
      border-radius: 3px;
      display: inline-block;
    }
    /* Title and Party Header */
    .party-header {
      text-align: center;
      padding: 14px 10px 10px 10px;
    }
    .party-title {
      font-size: 15pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      margin: 0;
    }
    .party-meta {
      font-size: 8.5pt;
      color: #475569;
      margin: 3px 0 0 0;
      font-weight: 500;
    }
    .period-text {
      font-size: 9pt;
      font-weight: 700;
      color: #334155;
      margin: 4px 0 0 0;
    }
    /* Summary Metric Strip (4 Cards) */
    .summary-strip {
      display: flex;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      margin: 12px 0 10px 0;
      overflow: hidden;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .summary-box {
      flex: 1;
      padding: 9px 12px;
      border-right: 1px solid #cbd5e1;
      text-align: left;
    }
    .summary-box:last-child {
      border-right: none;
    }
    .summary-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.4px;
      margin-bottom: 2px;
    }
    .summary-value {
      font-size: 12.5pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .summary-sub {
      font-size: 7.5pt;
      color: #64748b;
      margin-top: 2px;
      font-weight: 500;
    }
    /* Table Styling */
    .table-container {
      margin-top: 8px;
    }
    .entries-count-bar {
      font-size: 8pt;
      font-weight: 700;
      color: #334155;
      margin-bottom: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table.ledger-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #94a3b8;
      background: #ffffff;
    }
    table.ledger-table thead {
      display: table-header-group;
    }
    table.ledger-table tfoot {
      display: table-footer-group;
    }
    table.ledger-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    table.ledger-table th {
      padding: 7px 8px;
      font-size: 8pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      border: 1px solid #94a3b8;
      background: #f8fafc;
      vertical-align: middle;
    }
    table.ledger-table td {
      border-left: 1px solid #cbd5e1;
      border-right: 1px solid #cbd5e1;
    }
    /* Print footer */
    .document-footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5pt;
      color: #94a3b8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      body {
        background: #ffffff !important;
      }
      .statement-wrapper {
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      thead {
        display: table-header-group !important;
      }
      tfoot {
        display: table-footer-group !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="statement-wrapper">
    <!-- Blue Brand Bar -->
    <div class="brand-bar">
      <div class="brand-left">
        <h2>${shopName || 'STORE'}</h2>
        ${shopAddress ? `<p>${shopAddress}</p>` : ''}
        <p>
          ${shopPhone ? `Phone: ${shopPhone}` : ''}
          ${shopEmail ? ` · Email: ${shopEmail}` : ''}
          ${shopGstin ? ` · GSTIN: ${shopGstin}` : ''}
        </p>
      </div>
      <div class="brand-right">
        <div class="brand-badge">NAFID LEDGER</div>
      </div>
    </div>

    <!-- Party Statement Header -->
    <div class="party-header">
      <h1 class="party-title">${party.name} Statement</h1>
      <div class="party-meta">
        ${party.phone ? `Phone: <strong>${party.phone}</strong>` : ''}
        ${party.gstin ? ` · GSTIN: <strong>${party.gstin}</strong>` : ''}
        ${party.address ? ` · Address: ${party.address}` : ''}
        · Type: <strong>${partyTypeBadge}</strong>
      </div>
      <div class="period-text">(${recon.periodLabel})</div>
    </div>

    <!-- 4-Metric Summary Strip -->
    <div class="summary-strip">
      <!-- Card 1: Opening Balance -->
      <div class="summary-box">
        <div class="summary-label">Opening Balance</div>
        <div class="summary-value">₹${formatIndianCurrency(recon.openingBalance)}</div>
        <div class="summary-sub">${recon.startDateFormatted ? `(on ${recon.startDateFormatted})` : '(Initial)'} ${recon.obIndicator}</div>
      </div>

      <!-- Card 2: Total Credit / Gave / Sale -->
      <div class="summary-box">
        <div class="summary-label">${creditColHeader}</div>
        <div class="summary-value" style="color: #991b1b;">₹${formatIndianCurrency(recon.periodCredit)}</div>
        <div class="summary-sub">${recon.creditCount} ${recon.creditCount === 1 ? 'entry' : 'entries'}</div>
      </div>

      <!-- Card 3: Total Debit / Got / Payment -->
      <div class="summary-box">
        <div class="summary-label">${debitColHeader}</div>
        <div class="summary-value" style="color: #166534;">₹${formatIndianCurrency(recon.periodDebit)}</div>
        <div class="summary-sub">${recon.debitCount} ${recon.debitCount === 1 ? 'entry' : 'entries'}</div>
      </div>

      <!-- Card 4: Net Balance -->
      <div class="summary-box">
        <div class="summary-label">Net Balance</div>
        <div class="summary-value" style="color: ${recon.closingBalance > 0 ? '#b91c1c' : recon.closingBalance < 0 ? '#15803d' : '#0f172a'};">
          ₹${formatIndianCurrency(Math.abs(recon.closingBalance))}
          ${recon.closingIndicator ? `<span style="font-size: 9pt; font-weight:800; text-transform:uppercase;">${recon.closingIndicator}</span>` : ''}
        </div>
        <div class="summary-sub" style="font-weight: 700; color: ${recon.closingBalance > 0 ? '#b91c1c' : recon.closingBalance < 0 ? '#15803d' : '#64748b'};">
          ${recon.closingStatusText}
        </div>
      </div>
    </div>

    <!-- Table Section -->
    <div class="table-container">
      <div class="entries-count-bar">
        <span>No. of Entries: <strong>${recon.entryCount}</strong> (${filter.startDate || filter.endDate ? 'Filtered Period' : 'All'})</span>
        <span>Generated: ${nowFormatted}</span>
      </div>

      <table class="ledger-table">
        <thead>
          <tr>
            <th style="width: 14%; text-align: left;">Date</th>
            <th style="width: 38%; text-align: left;">Details / Particulars</th>
            <th style="width: 16%; text-align: right; background: #fff5f5; color: #991b1b; border-color: #94a3b8;">${creditColHeader}</th>
            <th style="width: 16%; text-align: right; background: #f0fdf4; color: #166534; border-color: #94a3b8;">${debitColHeader}</th>
            <th style="width: 16%; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>
          <!-- Opening Balance Row at top of table -->
          <tr style="background: #f8fafc; font-weight: 700; border-bottom: 2px solid #cbd5e1;">
            <td style="padding: 7px 9px; font-size: 8.5pt; color: #475569;">
              ${recon.startDateFormatted || 'Initial'}
            </td>
            <td style="padding: 7px 9px; font-size: 8.5pt; color: #475569; font-style: italic;">
              Opening Balance
            </td>
            <td style="padding: 7px 9px; text-align: right; color: #94a3b8;">—</td>
            <td style="padding: 7px 9px; text-align: right; color: #94a3b8;">—</td>
            <td style="padding: 7px 9px; text-align: right; font-weight: 800; font-size: 8.5pt; color: ${recon.openingBalance > 0 ? '#b91c1c' : recon.openingBalance < 0 ? '#15803d' : '#64748b'};">
              ₹${formatIndianCurrency(Math.abs(recon.openingBalance))}
              ${recon.obIndicator ? `<span style="font-size: 7.5pt; text-transform: uppercase;">${recon.obIndicator}</span>` : ''}
            </td>
          </tr>

          ${renderEntriesHtml()}
        </tbody>
        <tfoot>
          <!-- Grand Statement Totals -->
          <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #94a3b8; border-bottom: 1px solid #94a3b8;">
            <td colspan="2" style="padding: 8px 9px; text-align: right; font-size: 8.5pt; text-transform: uppercase; color: #1e293b; letter-spacing: 0.5px;">
              Statement Totals:
            </td>
            <td style="padding: 8px 9px; text-align: right; font-size: 9.5pt; color: #991b1b; background: #fee2e2;">
              ₹${formatIndianCurrency(recon.periodCredit)}
            </td>
            <td style="padding: 8px 9px; text-align: right; font-size: 9.5pt; color: #166534; background: #dcfce7;">
              ₹${formatIndianCurrency(recon.periodDebit)}
            </td>
            <td style="padding: 8px 9px; text-align: right; font-size: 9.5pt; color: ${recon.closingBalance > 0 ? '#b91c1c' : recon.closingBalance < 0 ? '#15803d' : '#0f172a'};">
              ₹${formatIndianCurrency(Math.abs(recon.closingBalance))}
              ${recon.closingIndicator ? `<span style="font-size: 7.5pt; text-transform: uppercase;">${recon.closingIndicator}</span>` : ''}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Document Footer -->
    <div class="document-footer">
      <div>
        This is a computer generated ledger statement from <strong>${shopName || 'Store'}</strong>. No physical signature required.
      </div>
      <div>
        ${party.name} · ${recon.periodLabel}
      </div>
    </div>
  </div>
</body>
</html>`;
}
