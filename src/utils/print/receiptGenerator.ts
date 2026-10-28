/**
 * Receipt printing: shared bill types, bill settings, date / amount formatting (receipt/receiptCore.ts) and the
 * thermal receipt text in nine styles (receipt/receiptText.ts + receipt/styles/<style>.ts).
 */
export { DEFAULT_BILL_SETTINGS, getEffectiveBillSettings, formatPrintItem, setAppTimeFormat, getAppTimeFormat, parseUTCDate, formatBillDateTime, numberToIndianWords, formatTaxBreakupSection } from './receipt/receiptCore';
export type { ReceiptItem, BillSettings, ReceiptData } from './receipt/receiptCore';
export { generateReceiptText } from './receipt/receiptText';
export type { ReceiptStyle } from './receipt/receiptText';
