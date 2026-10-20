/**
 * Shop Closing Overview Configuration & Helper Utilities
 * Nafid POS - WhatsApp Integration
 */

export interface ShopClosingChecklist {
  // General & Core
  dateTime: boolean;          // Business date & closing timestamp
  closingStatus: boolean;     // Register status (CLOSED / OPEN) & Remarks
  counterDetails: boolean;    // Counter / Terminal code & multi-counter breakdown
  closingStaff: boolean;      // Closing Staff / Cashier name

  // Sales Summary
  sales: boolean;             // Sales section header & Net Sales
  grossSales: boolean;        // Gross Sales (pre-discount)
  totalDiscount: boolean;     // Total Discount given
  taxCollected: boolean;      // Tax collected total
  invoices: boolean;          // Total Invoices Count

  // Payment Methods Breakdown (Master + Sub-items)
  paymentMethods: boolean;    // Master toggle for Payment Breakdown
  paymentCash: boolean;       // Cash collection
  paymentUpi: boolean;        // UPI / QR collection
  paymentCard: boolean;       // Card / POS collection
  paymentBank: boolean;       // Bank transfer collection
  paymentCheque: boolean;     // Cheque collection
  paymentCredit: boolean;     // Credit (Pay later) sales portion

  // Cash In, Out & Expenses
  cashBalances: boolean;      // Opening cash, Expected cash, Actual cash
  cashDifferences: boolean;   // Cash Shortage / Excess / Variance
  cashInOut: boolean;         // Cash In / Cash Out summary totals & counts
  cashInList: boolean;        // Itemized cash in list
  expenses: boolean;          // Business Expenses summary total
  expensesList: boolean;      // Itemized expenses list (ex: tea-10 etc..)

  // Credit, Customers, Staff & Operations
  creditSales: boolean;       // Credit Sales issued today
  customerPayments: boolean;  // Customer ledger collections / Got Cash
  partyTransactions: boolean; // Parties each transactions (ex: -suhaib :1000)
  staffTransactions: boolean; // Staff each transactions (advances, salary, payments)
  scrap: boolean;             // Scrap material purchases, deductions & entries
  returns: boolean;           // Sales returns count & amount
  refunds: boolean;           // Actual refunds paid out
  purchases: boolean;         // Supplier purchase bills total
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
  // Itemized lists
  expensesItems?: Array<{ description: string; amount: number; time?: string }>;
  cashInItems?: Array<{ description: string; amount: number; time?: string }>;
  partyTransactionItems?: Array<{ partyName: string; type: 'Got Cash' | 'Gave Cash' | string; amount: number; description?: string }>;
  staffTransactionItems?: Array<{ staffName: string; type: string; amount: number; notes?: string }>;
  scrapSummary?: {
    totalAmount: number;
    count: number;
    items: Array<{ categoryName: string; quantity: number; unit?: string; rate: number; totalAmount: number; partyName?: string }>;
  };
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
  grossSales: true,
  totalDiscount: true,
  taxCollected: true,
  invoices: true,
  paymentMethods: true,
  paymentCash: true,
  paymentUpi: true,
  paymentCard: true,
  paymentBank: true,
  paymentCheque: true,
  paymentCredit: true,
  cashBalances: true,
  cashDifferences: true,
  cashInOut: true,
  cashInList: true,
  expenses: true,
  expensesList: true,
  creditSales: true,
  customerPayments: true,
  partyTransactions: true,
  staffTransactions: true,
  scrap: true,
  returns: true,
  refunds: true,
  purchases: false,
};

export const ALL_CHECKLIST_SELECTED: ShopClosingChecklist = {
  dateTime: true,
  closingStatus: true,
  counterDetails: true,
  closingStaff: true,
  sales: true,
  grossSales: true,
  totalDiscount: true,
  taxCollected: true,
  invoices: true,
  paymentMethods: true,
  paymentCash: true,
  paymentUpi: true,
  paymentCard: true,
  paymentBank: true,
  paymentCheque: true,
  paymentCredit: true,
  cashBalances: true,
  cashDifferences: true,
  cashInOut: true,
  cashInList: true,
  expenses: true,
  expensesList: true,
  creditSales: true,
  customerPayments: true,
  partyTransactions: true,
  staffTransactions: true,
  scrap: true,
  returns: true,
  refunds: true,
  purchases: true,
};

export const ALL_CHECKLIST_CLEARED: ShopClosingChecklist = {
  dateTime: false,
  closingStatus: false,
  counterDetails: false,
  closingStaff: false,
  sales: false,
  grossSales: false,
  totalDiscount: false,
  taxCollected: false,
  invoices: false,
  paymentMethods: false,
  paymentCash: false,
  paymentUpi: false,
  paymentCard: false,
  paymentBank: false,
  paymentCheque: false,
  paymentCredit: false,
  cashBalances: false,
  cashDifferences: false,
  cashInOut: false,
  cashInList: false,
  expenses: false,
  expensesList: false,
  creditSales: false,
  customerPayments: false,
  partyTransactions: false,
  staffTransactions: false,
  scrap: false,
  returns: false,
  refunds: false,
  purchases: false,
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
  parentKey?: keyof ShopClosingChecklist; // Sub-item linked to a master group toggle
}

export const CHECKLIST_DEFINITIONS: ChecklistItemDefinition[] = [
  // ── 1. General & Shift Information (Core) ──
  { key: 'dateTime', label: 'Date & Time', description: 'Business date and shift closing timestamp', category: 'core' },
  { key: 'closingStatus', label: 'Closing Status', description: 'Register status (Closed/Open) & closing remarks', category: 'core' },
  { key: 'counterDetails', label: 'Counter Details', description: 'Terminal ID / Counter name & multi-counter breakdown', category: 'core' },
  { key: 'closingStaff', label: 'Closing Staff', description: 'Cashier / staff member who closed the settlement', category: 'core' },

  // ── 2. Sales Summary ──
  { key: 'sales', label: 'Sales Summary', description: 'Sales section header & Net Sales amount', category: 'sales' },
  { key: 'grossSales', label: 'Gross Sales (Pre-discount)', description: 'Total sales value before discounts and deductions', category: 'sales', parentKey: 'sales' },
  { key: 'totalDiscount', label: 'Total Discounts', description: 'Total discounts given to customers', category: 'sales', parentKey: 'sales' },
  { key: 'taxCollected', label: 'Tax Collected (GST)', description: 'Total GST/tax collected on invoices', category: 'sales', parentKey: 'sales' },
  { key: 'invoices', label: 'Invoices Count', description: 'Total count of settled bills for the day', category: 'sales' },

  // ── 3. Payment Methods Breakdown ──
  { key: 'paymentMethods', label: 'Payment Methods (Master Group)', description: 'Master toggle for all payment collections breakdown', category: 'sales' },
  { key: 'paymentCash', label: 'Cash Collection', description: 'Total payments received in Cash', category: 'sales', parentKey: 'paymentMethods' },
  { key: 'paymentUpi', label: 'UPI / QR Code', description: 'Total payments received via UPI (GPay, PhonePe, Paytm)', category: 'sales', parentKey: 'paymentMethods' },
  { key: 'paymentCard', label: 'Card / POS Terminal', description: 'Total payments received via Credit/Debit Cards', category: 'sales', parentKey: 'paymentMethods' },
  { key: 'paymentBank', label: 'Bank Transfer (NEFT/RTGS)', description: 'Direct bank transfer payments', category: 'sales', parentKey: 'paymentMethods' },
  { key: 'paymentCheque', label: 'Cheque Payments', description: 'Cheques received during the day', category: 'sales', parentKey: 'paymentMethods' },
  { key: 'paymentCredit', label: 'Credit Sales (Pay Later)', description: 'Pending credit sales balance', category: 'sales', parentKey: 'paymentMethods' },

  // ── 4. Cash Balances & Cash Flow ──
  { key: 'cashBalances', label: 'Cash Drawer Balances', description: 'Opening Cash, Expected in drawer, and Actual counted cash', category: 'cash' },
  { key: 'cashDifferences', label: 'Cash Difference (Short / Excess)', description: 'Variance between expected till cash and actual counted cash', category: 'cash' },
  { key: 'cashInOut', label: 'Cash In & Cash Out Summary', description: 'Total deposits and withdrawals with counts', category: 'cash' },
  { key: 'cashInList', label: 'Cash In Itemized List', description: 'View each Cash In entry (e.g. Opening Float, Owner Deposit)', category: 'cash' },
  { key: 'expenses', label: 'Expenses Summary Total', description: 'Total business expenses paid out from the till', category: 'cash' },
  { key: 'expensesList', label: 'Expenses Itemized List', description: 'View all expenses itemized (e.g. Tea - ₹10, Cleaning - ₹50)', category: 'cash' },

  // ── 5. Credit, Ledger, Staff & Operations ──
  { key: 'creditSales', label: 'Credit Sales Issued', description: 'Total sales issued on customer credit today', category: 'ops' },
  { key: 'customerPayments', label: 'Customer Payments (Got Cash)', description: 'Total collections towards old customer ledger balances', category: 'ops' },
  { key: 'partyTransactions', label: 'Party Transactions List', description: 'Each customer/supplier transaction (e.g. - Suhaib: ₹1000)', category: 'ops' },
  { key: 'staffTransactions', label: 'Staff Transactions List', description: 'Each employee transaction (e.g. - Rahul: ₹500 Advance)', category: 'ops' },
  { key: 'scrap', label: 'Scrap Transactions & Deductions', description: 'Scrap purchases, rates, materials & bill deductions', category: 'ops' },
  { key: 'returns', label: 'Sales Returns', description: 'Count and total amount of items returned by customers', category: 'ops' },
  { key: 'refunds', label: 'Refunds Paid', description: 'Actual cash/payment refunds paid out to customers', category: 'ops' },
  { key: 'purchases', label: 'Supplier Purchases', description: 'Total supplier purchase bills recorded today', category: 'ops' },
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
      if (checklist.grossSales !== false && data.grossSales > 0 && data.totalDiscount > 0) {
        lines.push(`• Gross Sales: ${formatCurrency(data.grossSales)}`);
      }
      if (checklist.totalDiscount !== false && data.totalDiscount > 0) {
        lines.push(`• Total Discount: -${formatCurrency(data.totalDiscount)}`);
      }
      if (checklist.taxCollected !== false && data.totalTax > 0) {
        lines.push(`• Tax Collected: ${formatCurrency(data.totalTax)}`);
      }
    }
  }

  // Payment Methods Breakdown
  if (checklist.paymentMethods) {
    const pm = data.paymentBreakdown;
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

  // Credit Sales & Customer Payments Total
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

  // Party Transactions List (Itemized)
  if (checklist.partyTransactions && data.partyTransactionItems && data.partyTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👥 *PARTY TRANSACTIONS:*`);
    data.partyTransactionItems.forEach((pt) => {
      const typeNote = pt.type ? ` (${pt.type})` : '';
      lines.push(`• -${pt.partyName} : *${formatCurrency(pt.amount)}*${typeNote}`);
    });
  }

  // Staff Transactions List (Itemized)
  if (checklist.staffTransactions && data.staffTransactionItems && data.staffTransactionItems.length > 0) {
    lines.push(``);
    lines.push(`👔 *STAFF TRANSACTIONS:*`);
    data.staffTransactionItems.forEach((st) => {
      const typeNote = st.type ? ` (${st.type})` : '';
      const notesTxt = st.notes ? ` - ${st.notes}` : '';
      lines.push(`• -${st.staffName} : *${formatCurrency(st.amount)}*${typeNote}${notesTxt}`);
    });
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

  // Cash In / Cash Out Summary
  if (checklist.cashInOut || checklist.expenses) {
    const items: string[] = [];
    if (checklist.cashInOut) {
      items.push(`• Total Cash In: +${formatCurrency(data.totalCashIn)} (${data.cashInCount} entry)`);
      items.push(`• Total Cash Out: -${formatCurrency(data.totalCashOut)} (${data.cashOutCount} entry)`);
    }
    if (checklist.expenses) {
      items.push(`• Total Expenses: *${formatCurrency(data.totalExpenses)}*`);
    }
    if (items.length > 0) {
      lines.push(``);
      lines.push(`💸 *CASH FLOW SUMMARY*`);
      lines.push(...items);
    }
  }

  // Itemized Cash In List
  if (checklist.cashInList && data.cashInItems && data.cashInItems.length > 0) {
    lines.push(``);
    lines.push(`📥 *CASH IN ENTRIES:*`);
    data.cashInItems.forEach((ci) => {
      lines.push(`• ${ci.description}: *+${formatCurrency(ci.amount)}*`);
    });
    lines.push(`*Total Cash In:* +${formatCurrency(data.totalCashIn)}`);
  }

  // Itemized Expenses List
  if (checklist.expensesList && data.expensesItems && data.expensesItems.length > 0) {
    lines.push(``);
    lines.push(`🧾 *EXPENSES LIST:*`);
    data.expensesItems.forEach((exp) => {
      lines.push(`• ${exp.description}: *${formatCurrency(exp.amount)}*`);
    });
    lines.push(`*Total Expenses:* ${formatCurrency(data.totalExpenses)}`);
  }

  // Scrap Transactions & Deductions
  if (checklist.scrap && data.scrapSummary && (data.scrapSummary.totalAmount > 0 || data.scrapSummary.count > 0)) {
    lines.push(``);
    lines.push(`♻️ *SCRAP ENTRIES:*`);
    data.scrapSummary.items.forEach((sc) => {
      const qtyTxt = sc.quantity > 0 ? ` (${sc.quantity} ${sc.unit || 'Kgs'}${sc.rate > 0 ? ` @ ${formatCurrency(sc.rate)}` : ''})` : '';
      lines.push(`• ${sc.categoryName}${qtyTxt}: *${formatCurrency(sc.totalAmount)}*`);
    });
    lines.push(`*Total Scrap:* ${formatCurrency(data.scrapSummary.totalAmount)}`);
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
      cheque: 500,
      credit: 1000,
    },
    creditSalesAmount: 1000,
    customerPaymentsCollected: 2400,
    totalCashIn: 1500,
    totalCashOut: 1200,
    cashInCount: 2,
    cashOutCount: 3,
    totalExpenses: 1200,
    expensesItems: [
      { description: 'tea', amount: 10 },
      { description: 'Shop Cleaning & Waste', amount: 50 },
      { description: 'Delivery Petrol', amount: 140 },
    ],
    cashInItems: [
      { description: 'Opening Float Deposit', amount: 1000 },
      { description: 'Owner Cash Injection', amount: 500 },
    ],
    partyTransactionItems: [
      { partyName: 'Suhaib', type: 'Got Cash', amount: 1000, description: 'Ledger payment' },
      { partyName: 'Al Madina Traders', type: 'Got Cash', amount: 1400, description: 'Invoice payment' },
    ],
    staffTransactionItems: [
      { staffName: 'Rahul', type: 'Advance', amount: 500, notes: 'Emergency' },
      { staffName: 'Sanjay', type: 'Salary', amount: 1200, notes: 'Part payment' },
    ],
    scrapSummary: {
      totalAmount: 950,
      count: 2,
      items: [
        { categoryName: 'Iron Scrap', quantity: 20, unit: 'Kgs', rate: 30, totalAmount: 600 },
        { categoryName: 'Copper Wire Scrap', quantity: 1, unit: 'Kgs', rate: 350, totalAmount: 350 },
      ],
    },
    returnsCount: 2,
    returnsAmount: 480,
    refundsPaidAmount: 480,
    purchasesCount: 1,
    purchasesAmount: 15800,
    openingBalance: 3000,
    expectedClosingCash: 21750,
    actualCashCounted: 21750,
    cashShortage: 0,
    cashExcess: 0,
    countersSummary: [
      { counterCode: 'POS-01', billerName: 'Alex', invoiceCount: 24, netSales: 26800, cashSales: 12400 },
      { counterCode: 'POS-02', billerName: 'Sam', invoiceCount: 14, netSales: 14700, cashSales: 6050 },
    ],
  };
}
