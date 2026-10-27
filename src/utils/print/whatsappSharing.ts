import { formatAmount } from '../pricing/money';

type PartyType = { party_type?: string | null; custom_category?: string | null };
export type BillFormat = 'text' | 'a4' | 'thermal';
export function parseBillFormats(value: unknown): BillFormat[] {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  const formats = Array.isArray(value) ? [...new Set(value.filter((v): v is BillFormat => v === 'text' || v === 'a4' || v === 'thermal'))] : [];
  return formats.length ? formats : ['text', 'a4'];
}
function partyMessageType(party: PartyType): string {
  return party.custom_category?.trim() || party.party_type?.trim() || '';
}
export function getPartyMessageTypes(parties: PartyType[]): string[] {
  return [...new Set(parties.map(partyMessageType).filter(Boolean))].sort();
}
export function allowsPartyMessage(selection: unknown, party: PartyType): boolean {
  if (typeof selection === 'string') { try { selection = JSON.parse(selection); } catch { selection = null; } }
  return !Array.isArray(selection) || selection.includes(partyMessageType(party));
}
export function formatPurchaseLedgerMessage(entry: { credit_amount: number; debit_amount: number; running_balance: number }): string {
  const amount = (value: number) => formatAmount(value, Number.isInteger(value) ? 0 : 2);
  const opening = entry.running_balance - entry.credit_amount + entry.debit_amount;
  return `OB: ₹ ${amount(opening)}/-\nPurchase: ₹ ${amount(entry.debit_amount)}/-\nBalance: ₹ ${amount(entry.running_balance)}/-`;
}
export function buildBillShares(input: { phone: string; message: string; a4Html: string; legacyHtml?: string; receiptText: string; invoiceNumber: string; receiptWidthMm?: number }, formats: BillFormat[]) {
  const summary = input.message.replace(/\n?📄 Detailed PDF invoice is attached below\./, '').trimEnd();
  const documents = formats.filter(f => f !== 'text');
  if (!documents.length) return [{ phone: input.phone, message: summary }];
  return documents.map((format, index) => ({
    phone: input.phone,
    message: formats.includes('text') && index === 0 ? summary : `${format === 'thermal' ? 'Receipt' : 'Invoice'} ${input.invoiceNumber}`,
    ...(format === 'thermal' ? { receiptText: input.receiptText, receiptWidthMm: input.receiptWidthMm || 80 } : { htmlContent: input.a4Html }),
    fileName: `${format === 'thermal' ? 'Receipt' : 'Invoice'}_${input.invoiceNumber}.pdf`,
  }));
}
