/**
 * Shop Closing Overview Configuration & Helper Utilities
 * Nafid POS - WhatsApp Integration
 */

export interface ShopClosingChecklist {
  sales: boolean;            // Total Sales, Gross Sales, Net Sales, Discounts
  invoices: boolean;         // Total Invoices Count
  paymentMethods: boolean;   // Payment Methods Breakdown (Cash, Card, UPI, Bank, Cheque, Credit)
  expenses: boolean;         // Business Expenses / Cash Out
  cashInOut: boolean;        // Cash In / Cash Out summary & count
  creditSales: boolean;      // Credit Sales issued today
  customerPayments: boolean; // Customer ledger collections / Got Cash
  returns: boolean;          // Sales returns count & amount
  refunds: boolean;          // Actual refunds paid out
  purchases: boolean;        // Supplier purchase bills total
  cashBalances: boolean;     // Opening cash, Expected cash, Actual cash
  cashDifferences: boolean;  // Cash Shortage / Excess / Variance
  closingStaff: boolean;     // Closing Staff / Cashier name
  dateTime: boolean;         // Business date & closing timestamp
  counterDetails: boolean;   // Counter / Terminal code & multi-counter breakdown
  closingStatus: boolean;    // Register status (CLOSED / OPEN) & Remarks
}

export type ShopClosingSendTiming = 'IMMEDIATELY' | 'SCHEDULED' | 'BOTH';

export interface ShopClosingOverviewConfig {
  enabled: boolean;
  ownerPhone: string;
  sendTiming: ShopClosingSendTiming;
  scheduledTime: string; // "HH:mm" in 24hr format (e.g., "22:00")
  includeMultiCounterBreakdown: boolean;
  checklist: ShopClosingChecklist;
}

export interface ShopClosingDataSummary {
  tenantId: string;
  shopName: string;
  businessDate: string;
  closingTimestamp: string;
  closingStaffName?: string;
  closingStaffRole?: string;
  registerStatus: 'CLOSED' | 'OPEN';
  closingRemarks?: string;
  counterCode: string;
  // Financial metrics
  totalInvoices: number;
  grossSales: number;
  totalDiscount: number;
  netSales: number;
  totalTax: number;
  // Payment methods
  paymentBreakdown: {
    cash: number;
    card: number;
    upi: number;
    bankTransfer: number;
    cheque: number;
    credit: number;
  };
  // Credit & collections
  creditSalesAmount: number;
  customerPaymentsCollected: number;
  // Cash In / Out & Expenses
  totalCashIn: number;
  totalCashOut: number;
  cashInCount: number;
  cashOutCount: number;
  totalExpenses: number;
  // Returns & Refunds
  returnsCount: number;
  returnsAmount: number;
  refundsPaidAmount: number;
  // Supplier Purchases
  purchasesCount: number;
  purchasesAmount: number;
  // Drawer balances
  openingBalance: number;
  expectedClosingCash: number;
  actualCashCounted: number;
  cashShortage: number;
  cashExcess: number;
  // Multi-counter details (if multiple counters exist)
  countersSummary: Array<{
    counterCode: string;
    billerName?: string;
    invoiceCount: number;
    netSales: number;
    cashSales: number;
  }>;
}

export interface ShopClosingReportLog {
  id: string;
  tenant_id: string;
  business_date: string;
  trigger_type: 'SETTLEMENT_CLOSE' | 'SCHEDULED' | 'MANUAL';
  terminal_code?: string;
  recipient_phone: string;
  summary_data?: string;
  checklist_config?: string;
  message_text: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  whatsapp_message_id?: string;
  error_message?: string;
  retry_count: number;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CHECKLIST: ShopClosingChecklist = {
  dateTime: true,
  closingStatus: true,
  counterDetails: true,
  closingStaff: true,
  sales: true,
  invoices: true,
  paymentMethods: true,
  cashBalances: true,
  cashDifferences: true,
  cashInOut: true,
  expenses: true,
  creditSales: true,
  customerPayments: true,
  returns: true,
  refunds: true,
  purchases: false,
};

export const ALL_CHECKLIST_SELECTED: ShopClosingChecklist = {
  sales: true,
  invoices: true,
  paymentMethods: true,
  expenses: true,
  cashInOut: true,
  creditSales: true,
  customerPayments: true,
  returns: true,
  refunds: true,
  purchases: true,
  cashBalances: true,
  cashDifferences: true,
  closingStaff: true,
  dateTime: true,
  counterDetails: true,
  closingStatus: true,
};

export const ALL_CHECKLIST_CLEARED: ShopClosingChecklist = {
  sales: false,
  invoices: false,
  paymentMethods: false,
  expenses: false,
  cashInOut: false,
  creditSales: false,
  customerPayments: false,
  returns: false,
  refunds: false,
  purchases: false,
  cashBalances: false,
  cashDifferences: false,
  closingStaff: false,
  dateTime: false,
  counterDetails: false,
  closingStatus: false,
};

export const DEFAULT_SHOP_CLOSING_CONFIG: ShopClosingOverviewConfig = {
  enabled: false,
  ownerPhone: '',
  sendTiming: 'IMMEDIATELY',
  scheduledTime: '22:00',
  includeMultiCounterBreakdown: true,
  checklist: DEFAULT_CHECKLIST,
};

export interface ChecklistItemDefinition {
  key: keyof ShopClosingChecklist;
  label: string;
  description: string;
  category: 'core' | 'sales' | 'cash' | 'ops';
}

export const CHECKLIST_DEFINITIONS: ChecklistItemDefinition[] = [
  { key: 'dateTime', label: 'Date & Time', description: 'Business date and closing timestamp', category: 'core' },
  { key: 'closingStatus', label: 'Closing Status', description: 'Register status (Closed/Open) & closing remarks', category: 'core' },
  { key: 'counterDetails', label: 'Counter Details', description: 'Terminal ID / Counter name & multi-counter breakdown', category: 'core' },
  { key: 'closingStaff', label: 'Closing Staff', description: 'Cashier / staff member who closed the settlement', category: 'core' },

  { key: 'sales', label: 'Sales Summary', description: 'Net Sales, Gross Sales, and total discounts applied', category: 'sales' },
  { key: 'invoices', label: 'Invoices Count', description: 'Total bills issued and settled during the day', category: 'sales' },
  { key: 'paymentMethods', label: 'Payment Methods Breakdown', description: 'Collections by Cash, Card, UPI, Bank, Cheque & Credit', category: 'sales' },
  { key: 'creditSales', label: 'Credit Sales', description: 'Total sales issued on customer credit / pay later', category: 'sales' },
  { key: 'customerPayments', label: 'Customer Payments', description: 'Debtor payments collected today towards old balances (Got Cash)', category: 'sales' },

  { key: 'cashBalances', label: 'Cash Balances', description: 'Opening Cash, Expected in drawer, and Actual physical cash counted', category: 'cash' },
  { key: 'cashDifferences', label: 'Cash Difference (Short / Excess)', description: 'Variance between expected till cash and actual counted cash', category: 'cash' },
  { key: 'cashInOut', label: 'Cash In / Cash Out', description: 'Total deposits (Cash In) and withdrawals (Cash Out) with counts', category: 'cash' },

  { key: 'expenses', label: 'Business Expenses', description: 'Expenses paid from register (Cash Out expenses)', category: 'ops' },
  { key: 'returns', label: 'Sales Returns', description: 'Count and total amount of items returned by customers', category: 'ops' },
  { key: 'refunds', label: 'Refunds Paid', description: 'Actual cash/payment refunds paid out to customers', category: 'ops' },
  { key: 'purchases', label: 'Supplier Purchases', description: 'Total purchase bills recorded for suppliers today', category: 'ops' },
];

/**
 * Format currency amount helper (INR ₹)
 */
export function formatCurrency(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `-₹${absFormatted}` : `₹${absFormatted}`;
}

/**
 * Clean phone number helper
 */
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '').trim();
}

/**
 * Validate phone number
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 8 && cleaned.length <= 15;
}

/**
 * Generates the clean WhatsApp formatted text report based on summary data and selected checklist options.
 */
export function generateWhatsAppClosingMessage(
  data: ShopClosingDataSummary,
  checklist: ShopClosingChecklist
): string {
  const lines: string[] = [];

  // Header
  lines.push(`🏪 *SHOP CLOSING OVERVIEW*`);
  lines.push(`🏢 *${data.shopName || 'STORE'}*`);

  // Date & Time
  if (checklist.dateTime) {
    lines.push(`📅 *Date:* ${data.businessDate}`);
    if (data.closingTimestamp) {
      lines.push(`⏰ *Closing Time:* ${data.closingTimestamp}`);
    }
  }

  // Counter details
  if (checklist.counterDetails) {
    lines.push(`🖥️ *Counter:* ${data.counterCode || 'Main Counter'}`);
  }

  // Closing Staff
  if (checklist.closingStaff && data.closingStaffName) {
    const roleTxt = data.closingStaffRole ? ` (${data.closingStaffRole})` : '';
    lines.push(`👤 *Closed By:* ${data.closingStaffName}${roleTxt}`);
  }

  // Closing Status
  if (checklist.closingStatus) {
    const statusIcon = data.registerStatus === 'CLOSED' ? '🔒' : '🔓';
    lines.push(`${statusIcon} *Status:* ${data.registerStatus === 'CLOSED' ? 'CLOSED (Settled)' : 'OPEN / In Progress'}`);
    if (data.closingRemarks) {
      lines.push(`📝 *Remarks:* ${data.closingRemarks}`);
    }
  }

  // Sales & Invoices
  if (checklist.sales || checklist.invoices) {
    lines.push(``);
    lines.push(`📊 *SALES SUMMARY*`);
    if (checklist.invoices) {
      lines.push(`• Total Invoices: *${data.totalInvoices}*`);
    }
    if (checklist.sales) {
      lines.push(`• Net Sales: *${formatCurrency(data.netSales)}*`);
      if (data.totalDiscount > 0) {
        lines.push(`• Gross Sales: ${formatCurrency(data.grossSales)}`);
        lines.push(`• Total Discount: -${formatCurrency(data.totalDiscount)}`);
      }
      if (data.totalTax > 0) {
        lines.push(`• Tax Collected: ${formatCurrency(data.totalTax)}`);
      }
    }
  }

  // Payment Methods
  if (checklist.paymentMethods) {
    const pm = data.paymentBreakdown;
    lines.push(``);
    lines.push(`💳 *PAYMENT BREAKDOWN*`);
    lines.push(`• Cash: *${formatCurrency(pm.cash)}*`);
    lines.push(`• UPI / QR: *${formatCurrency(pm.upi)}*`);
    lines.push(`• Card / POS: *${formatCurrency(pm.card)}*`);
    if (pm.bankTransfer > 0) {
      lines.push(`• Bank Transfer: ${formatCurrency(pm.bankTransfer)}`);
    }
    if (pm.cheque > 0) {
      lines.push(`• Cheque: ${formatCurrency(pm.cheque)}`);
    }
    if (pm.credit > 0) {
      lines.push(`• Credit (Pending): ${formatCurrency(pm.credit)}`);
    }
  }

  // Credit Sales & Customer Payments
  if (checklist.creditSales || checklist.customerPayments) {
    const items: string[] = [];
    if (checklist.creditSales) {
      items.push(`• Credit Sales Issued: *${formatCurrency(data.creditSalesAmount)}*`);
    }
    if (checklist.customerPayments) {
      items.push(`• Customer Ledger Collections: *${formatCurrency(data.customerPaymentsCollected)}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`📑 *CREDIT & COLLECTIONS*`);
      lines.push(...items);
    }
  }

  // Cash Balances & Differences
  if (checklist.cashBalances || checklist.cashDifferences) {
    lines.push(``);
    lines.push(`💰 *CASH DRAWER RECONCILIATION*`);
    if (checklist.cashBalances) {
      lines.push(`• Opening Balance: ${formatCurrency(data.openingBalance)}`);
      lines.push(`• Expected Closing Cash: *${formatCurrency(data.expectedClosingCash)}*`);
      lines.push(`• Actual Counted Cash: *${formatCurrency(data.actualCashCounted)}*`);
    }
    if (checklist.cashDifferences) {
      if (data.cashShortage > 0) {
        lines.push(`• ⚠️ *Cash Shortage:* -${formatCurrency(data.cashShortage)}`);
      } else if (data.cashExcess > 0) {
        lines.push(`• ➕ *Cash Excess:* +${formatCurrency(data.cashExcess)}`);
      } else {
        lines.push(`• ✅ *Cash Variance:* Balanced (₹0.00)`);
      }
    }
  }

  // Cash In / Cash Out & Expenses
  if (checklist.cashInOut || checklist.expenses) {
    const items: string[] = [];
    if (checklist.cashInOut) {
      items.push(`• Cash In (Deposits): +${formatCurrency(data.totalCashIn)} (${data.cashInCount} entry)`);
      items.push(`• Cash Out (Withdrawals): -${formatCurrency(data.totalCashOut)} (${data.cashOutCount} entry)`);
    }
    if (checklist.expenses) {
      items.push(`• Business Expenses: *${formatCurrency(data.totalExpenses)}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`💸 *CASH TRANSACTIONS & EXPENSES*`);
      lines.push(...items);
    }
  }

  // Returns & Refunds
  if (checklist.returns || checklist.refunds) {
    const items: string[] = [];
    if (checklist.returns) {
      items.push(`• Sales Returns: *${formatCurrency(data.returnsAmount)}* (${data.returnsCount} return)`);
    }
    if (checklist.refunds) {
      items.push(`• Refunds Paid Out: *${formatCurrency(data.refundsPaidAmount)}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`↩️ *RETURNS & REFUNDS*`);
      lines.push(...items);
    }
  }

  // Purchases
  if (checklist.purchases && data.purchasesAmount > 0) {
    lines.push(``);
    lines.push(`📦 *PURCHASES*`);
    lines.push(`• Supplier Bills: *${formatCurrency(data.purchasesAmount)}* (${data.purchasesCount} bill)`);
  }

  // Multi-counter breakdown
  if (checklist.counterDetails && data.countersSummary && data.countersSummary.length > 1) {
    lines.push(``);
    lines.push(`🖩 *MULTI-COUNTER BREAKDOWN*`);
    data.countersSummary.forEach((c) => {
      lines.push(`• *${c.counterCode}*: ${c.invoiceCount} bills | Net: ${formatCurrency(c.netSales)} (Cash: ${formatCurrency(c.cashSales)})`);
    });
  }

  // Footer
  lines.push(``);
  lines.push(`— *Generated by Nafid POS*`);

  return lines.join('\n');
}

/**
 * Sample / mockup data generator for live preview when no transactions exist yet
 */
export function getSampleClosingSummary(shopName: string = 'My Store'): ShopClosingDataSummary {
  return {
    tenantId: 'global',
    shopName,
    businessDate: new Date().toLocaleDateString('en-GB'),
    closingTimestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    closingStaffName: 'Alex Morgan',
    closingStaffRole: 'Cashier / Store Staff',
    registerStatus: 'CLOSED',
    closingRemarks: 'Shift closed without issues. Safe deposit done.',
    counterCode: 'POS-01 (Main)',
    totalInvoices: 38,
    grossSales: 42850,
    totalDiscount: 1350,
    netSales: 41500,
    totalTax: 3240,
    paymentBreakdown: {
      cash: 18450,
      upi: 14200,
      card: 6350,
      bankTransfer: 1500,
      cheque: 0,
      credit: 1000,
    },
    creditSalesAmount: 1000,
    customerPaymentsCollected: 2400,
    totalCashIn: 500,
    totalCashOut: 1200,
    cashInCount: 1,
    cashOutCount: 2,
    totalExpenses: 1200,
    returnsCount: 2,
    returnsAmount: 480,
    refundsPaidAmount: 480,
    purchasesCount: 1,
    purchasesAmount: 15800,
    openingBalance: 3000,
    expectedClosingCash: 20750,
    actualCashCounted: 20750,
    cashShortage: 0,
    cashExcess: 0,
    countersSummary: [
      { counterCode: 'POS-01', billerName: 'Alex', invoiceCount: 24, netSales: 26800, cashSales: 12400 },
      { counterCode: 'POS-02', billerName: 'Sam', invoiceCount: 14, netSales: 14700, cashSales: 6050 },
    ],
  };
}
