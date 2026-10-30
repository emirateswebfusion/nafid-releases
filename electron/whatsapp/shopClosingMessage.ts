import type { ShopClosingChecklist } from './shopClosingTypes.js';

/** Formats the shop closing WhatsApp message from the summary data and the owner's checklist. */
function formatStoreCurrency(amount: number | null | undefined, country?: string): string {
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString(country === 'AE' ? 'en-AE' : 'en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = country === 'AE' ? 'AED ' : '₹';
  return `${isNegative ? '-' : ''}${prefix}${absFormatted}`;
}

/**
 * Format the WhatsApp closing message based on checklist
 */
export function formatClosingWhatsAppMessage(summaryData: ReturnType<typeof import('./shopClosingSummary.js').buildShopClosingSummaryData>, checklist: ShopClosingChecklist): string {
  const formatCurrency = (amount: number | null | undefined) => formatStoreCurrency(amount, summaryData.storeCountry);
  const lines: string[] = [];

  // Header
  lines.push(`🏪 *SHOP CLOSING OVERVIEW*`);
  lines.push(`🏢 *${summaryData.shopName || 'STORE'}*`);

  // Date & Time
  if (checklist.dateTime) {
    lines.push(`📅 *Date:* ${summaryData.businessDate}`);
    if (summaryData.closingTimestamp) {
      const isClosed = summaryData.registerStatus === 'CLOSED';
      const timeLabel = isClosed ? 'Closing Time' : 'Report Time';
      lines.push(`⏰ *${timeLabel}:* ${summaryData.closingTimestamp}`);
    }
  }

  // Counter details
  if (checklist.counterDetails) {
    lines.push(`🖥️ *Counter:* ${summaryData.counterCode || 'Main Counter'}`);
  }

  // Closing Staff
  if (checklist.closingStaff && summaryData.closingStaffName) {
    lines.push(`👤 *Closed By:* ${summaryData.closingStaffName}`);
  }

  // Closing Status
  if (checklist.closingStatus) {
    const isClosed = summaryData.registerStatus === 'CLOSED';
    lines.push(`${isClosed ? '🔒' : '🔓'} *Status:* ${isClosed ? 'CLOSED (Settled)' : 'OPEN / In Progress'}`);
    if (summaryData.closingRemarks) {
      lines.push(`📝 *Remarks:* ${summaryData.closingRemarks}`);
    }
  }

  // Sales & Invoices
  if (checklist.sales || checklist.invoices) {
    lines.push(``);
    lines.push(`📊 *SALES SUMMARY*`);
    if (checklist.invoices) {
      lines.push(`• Total Invoices: *${summaryData.totalInvoices}*`);
    }
    if (checklist.sales) {
      lines.push(`• Net Sales: *${formatCurrency((summaryData.netSales as number | null | undefined))}*`);
      if (checklist.grossSales !== false && summaryData.grossSales > 0 && summaryData.totalDiscount > 0) {
        lines.push(`• Gross Sales: ${formatCurrency((summaryData.grossSales as number | null | undefined))}`);
      }
      if (checklist.totalDiscount !== false && summaryData.totalDiscount > 0) {
        lines.push(`• Total Discount: -${formatCurrency((summaryData.totalDiscount as number | null | undefined))}`);
      }
      if (checklist.taxCollected !== false && summaryData.totalTax > 0) {
        lines.push(`• Tax Collected: ${formatCurrency((summaryData.totalTax as number | null | undefined))}`);
      }
    }
  }

  // Payment Breakdown
  if (checklist.paymentMethods) {
    const pm = summaryData.paymentBreakdown;
    const pmLines: string[] = [];
    if (checklist.paymentCash !== false && (pm.cash > 0 || (pm.upi === 0 && pm.card === 0 && pm.bankTransfer === 0 && pm.cheque === 0 && pm.credit === 0))) {
      pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    } else if (checklist.paymentCash !== false && pm.cash > 0) {
      pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    }
    if (checklist.paymentUpi !== false && pm.upi > 0) {
      pmLines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
    }
    if (checklist.paymentCard !== false && pm.card > 0) {
      pmLines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
    }
    if (checklist.paymentBank !== false && pm.bankTransfer > 0) {
      pmLines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
    }
    if (checklist.paymentCheque !== false && pm.cheque > 0) {
      pmLines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
    }
    if (checklist.paymentCredit !== false && pm.credit > 0) {
      pmLines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
    }

    // If all payment collections are 0.00, show only selected modes with 0.00 rather than cluttering
    if (pmLines.length === 0) {
      if (checklist.paymentCash !== false) pmLines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
      if (checklist.paymentUpi !== false) pmLines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
      if (checklist.paymentCard !== false) pmLines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
      if (checklist.paymentBank !== false && pm.bankTransfer > 0) pmLines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
      if (checklist.paymentCheque !== false && pm.cheque > 0) pmLines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
      if (checklist.paymentCredit !== false && pm.credit > 0) pmLines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
    }

    if (pmLines.length > 0) {
      lines.push(``);
      lines.push(`💳 *PAYMENT BREAKDOWN*`);
      lines.push(...pmLines);
    }
  }

  // Credit & Collections
  if (checklist.creditSales || checklist.customerPayments) {
    const items: string[] = [];
    if (checklist.creditSales) items.push(`• Credit Sales Issued: *${formatCurrency((summaryData.creditSalesAmount as number | null | undefined))}*`);
    if (checklist.customerPayments) items.push(`• Customer Ledger Collections: *${formatCurrency((summaryData.customerPaymentsCollected as number | null | undefined))}*`);
    if (items.length > 0) {
      lines.push(``);
      lines.push(`📑 *CREDIT & COLLECTIONS*`);
      lines.push(...items);
    }
  }

  // Party Transactions List (Itemized)
  if (checklist.partyTransactions && summaryData.partyTransactionItems && summaryData.partyTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👥 *PARTY TRANSACTIONS:*`);
    summaryData.partyTransactionItems.forEach((pt: Record<string, unknown>) => {
      const typeNote = pt.type ? ` (${pt.type})` : '';
      lines.push(`• -${pt.partyName} : *${formatCurrency((pt.amount as number | null | undefined))}*${typeNote}`);
    });
  }

  // Staff Transactions List (Itemized)
  if (checklist.staffTransactions && summaryData.staffTransactionItems && summaryData.staffTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👔 *STAFF TRANSACTIONS:*`);
    summaryData.staffTransactionItems.forEach((st: Record<string, unknown>) => {
      const typeNote = st.type ? ` (${st.type})` : '';
      const notesTxt = st.notes ? ` - ${st.notes}` : '';
      lines.push(`• -${st.staffName} : *${formatCurrency((st.amount as number | null | undefined))}*${typeNote}${notesTxt}`);
    });
  }

  // Cash Balances & Differences
  if (checklist.cashBalances || checklist.cashDifferences) {
    lines.push(``);
    lines.push(`💰 *CASH DRAWER RECONCILIATION*`);
    if (checklist.cashBalances) {
      lines.push(`• Opening Balance: ${formatCurrency((summaryData.openingBalance as number | null | undefined))}`);
      lines.push(`• Expected Closing Cash: *${formatCurrency((summaryData.expectedClosingCash as number | null | undefined))}*`);
      lines.push(`• Actual Counted Cash: *${formatCurrency((summaryData.actualCashCounted as number | null | undefined))}*`);
    }
    if (checklist.cashDifferences) {
      if (summaryData.cashShortage > 0) {
        lines.push(`• ⚠️ *Cash Shortage:* -${formatCurrency((summaryData.cashShortage as number | null | undefined))}`);
      } else if (summaryData.cashExcess > 0) {
        lines.push(`• ➕ *Cash Excess:* +${formatCurrency((summaryData.cashExcess as number | null | undefined))}`);
      } else {
        lines.push(`• ✅ *Cash Variance:* Balanced (${formatCurrency(0)})`);
      }
    }
  }

  // Cash In / Out & Expenses
  if (checklist.cashInOut || checklist.expenses) {
    const items: string[] = [];
    if (checklist.cashInOut) {
      items.push(`• Cash In (Deposits): +${formatCurrency((summaryData.totalCashIn as number | null | undefined))} (${summaryData.cashInCount} entry)`);
      items.push(`• Cash Out (Withdrawals): -${formatCurrency((summaryData.totalCashOut as number | null | undefined))} (${summaryData.cashOutCount} entry)`);
    }
    if (checklist.expenses) {
      items.push(`• Business Expenses: *${formatCurrency((summaryData.totalExpenses as number | null | undefined))}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`💸 *CASH FLOW SUMMARY*`);
      lines.push(...items);
    }
  }

  // Itemized Cash In List
  if (checklist.cashInList && summaryData.cashInItems && summaryData.cashInItems.length > 0) {
    lines.push(``);
    lines.push(`📥 *CASH IN ENTRIES:*`);
    summaryData.cashInItems.forEach((ci: Record<string, unknown>) => {
      lines.push(`• ${ci.description}: *+${formatCurrency((ci.amount as number | null | undefined))}*`);
    });
    lines.push(`*Total Cash In:* +${formatCurrency((summaryData.totalCashIn as number | null | undefined))}`);
  }

  // Itemized Expenses List
  if (checklist.expensesList && summaryData.expensesItems && summaryData.expensesItems.length > 0) {
    lines.push(``);
    lines.push(`🧾 *EXPENSES LIST:*`);
    summaryData.expensesItems.forEach((exp: Record<string, unknown>) => {
      lines.push(`• ${exp.description}: *${formatCurrency((exp.amount as number | null | undefined))}*`);
    });
    lines.push(`*Total Expenses:* ${formatCurrency((summaryData.totalExpenses as number | null | undefined))}`);
  }

  // Scrap Transactions & Deductions
  if (checklist.scrap && summaryData.scrapSummary && (summaryData.scrapSummary.totalAmount > 0 || summaryData.scrapSummary.count > 0)) {
    lines.push(``);
    lines.push(`♻️ *SCRAP ENTRIES:*`);
    if (checklist.scrapSales !== undefined || checklist.scrapCategories !== undefined) {
      const items = summaryData.scrapSummary.items.filter(item => checklist.scrapSales !== false || item.type !== 'SALE');
      if (checklist.scrapCategories !== false) {
        const categories = new Map<string, number>();
        for (const item of items) {
          const label = `${item.categoryName} (${item.type === 'SALE' ? 'Sale' : 'Purchase'})`;
          categories.set(label, (categories.get(label) || 0) + item.totalAmount);
        }
        for (const [label, amount] of categories) lines.push(`• ${label}: *${formatCurrency(amount)}*`);
      }
      const purchases = items.filter(item => item.type !== 'SALE').reduce((sum, item) => sum + item.totalAmount, 0);
      lines.push(`*Scrap Purchase Total:* ${formatCurrency(purchases)}`);
      if (checklist.scrapSales !== false) {
        const sales = items.filter(item => item.type === 'SALE').reduce((sum, item) => sum + item.totalAmount, 0);
        lines.push(`*Scrap Sales Total:* ${formatCurrency(sales)}`);
      }
    } else {
    summaryData.scrapSummary.items.forEach((sc: Record<string, unknown>) => {
      const qtyTxt = (sc.quantity as number) > 0 ? ` (${sc.quantity} ${sc.unit || 'Kgs'}${(sc.rate as number) > 0 ? ` @ ${formatCurrency((sc.rate as number | null | undefined))}` : ''})` : '';
      lines.push(`• ${sc.categoryName}${qtyTxt}: *${formatCurrency((sc.totalAmount as number | null | undefined))}*`);
    });
    lines.push(`*Total Scrap:* ${formatCurrency(summaryData.scrapSummary.totalAmount)}`);
    }
  }

  // Returns & Refunds
  if (checklist.returns || checklist.refunds) {
    const items: string[] = [];
    if (checklist.returns) items.push(`• Sales Returns: *${formatCurrency((summaryData.returnsAmount as number | null | undefined))}* (${summaryData.returnsCount} return)`);
    if (checklist.refunds) items.push(`• Refunds Paid Out: *${formatCurrency((summaryData.refundsPaidAmount as number | null | undefined))}*`);
    if (items.length > 0) {
      lines.push(``);
      lines.push(`↩️ *RETURNS & REFUNDS*`);
      lines.push(...items);
    }
  }

  // Purchases
  if (checklist.purchases && summaryData.purchasesAmount > 0) {
    lines.push(``);
    lines.push(`📦 *PURCHASES*`);
    lines.push(`• Supplier Bills: *${formatCurrency((summaryData.purchasesAmount as number | null | undefined))}* (${summaryData.purchasesCount} bill)`);
  }

  // Multi-counter breakdown
  if (checklist.counterDetails && summaryData.countersSummary && summaryData.countersSummary.length > 1) {
    lines.push(``);
    lines.push(`🖩 *MULTI-COUNTER BREAKDOWN*`);
    summaryData.countersSummary.forEach((c: Record<string, unknown>) => {
      lines.push(`• *${c.counterCode}*: ${c.invoiceCount} bills | Net: ${formatCurrency((c.netSales as number | null | undefined))} (Cash: ${formatCurrency((c.cashSales as number | null | undefined))})`);
    });
  }

  // Footer
  lines.push(``);
  lines.push(`— *Generated by Nafid POS*`);

  return lines.join('\n');
}
