/** Shop closing WhatsApp report: owner's checklist, send timing and saved config. */
export interface ShopClosingChecklist {
  sales: boolean;
  grossSales?: boolean;
  totalDiscount?: boolean;
  taxCollected?: boolean;
  invoices: boolean;
  paymentMethods: boolean;
  paymentCash?: boolean;
  paymentUpi?: boolean;
  paymentCard?: boolean;
  paymentBank?: boolean;
  paymentCheque?: boolean;
  paymentCredit?: boolean;
  expenses: boolean;
  expensesList: boolean;
  cashInOut: boolean;
  cashInList: boolean;
  creditSales: boolean;
  customerPayments: boolean;
  partyTransactions: boolean;
  staffTransactions: boolean;
  scrap: boolean;
  returns: boolean;
  refunds: boolean;
  purchases: boolean;
  cashBalances: boolean;
  cashDifferences: boolean;
  closingStaff: boolean;
  dateTime: boolean;
  counterDetails: boolean;
  closingStatus: boolean;
}

export type ShopClosingSendTiming = 'IMMEDIATELY' | 'SCHEDULED' | 'BOTH';

export interface ShopClosingOverviewConfig {
  enabled: boolean;
  ownerPhone: string;
  sendTiming: ShopClosingSendTiming;
  scheduledTime: string; // "HH:mm" 24h
  includeMultiCounterBreakdown: boolean;
  checklist: ShopClosingChecklist;
}
