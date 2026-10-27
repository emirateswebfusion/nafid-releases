import { getSetting } from './settings';
import { whatsappApi } from './whatsapp';
import { allowsPartyMessage, buildBillShares, parseBillFormats } from '../utils/print/whatsappSharing';

export async function isLedgerRecipientAllowed(tenantId: string, party: { party_type?: string | null; custom_category?: string | null }): Promise<boolean> {
  return allowsPartyMessage(await getSetting({ tenant_id: tenantId, key: 'ledger_whatsapp_party_types' }), party);
}
export async function sendConfiguredBill(tenantId: string, input: Parameters<typeof buildBillShares>[0]) {
  const stored = await getSetting({ tenant_id: tenantId, key: 'whatsapp_bill_formats' });
  const formats = parseBillFormats(stored);
  const content = stored == null && input.legacyHtml ? { ...input, a4Html: input.legacyHtml } : input;
  for (const payload of buildBillShares(content, formats)) {
    const result = await whatsappApi.sendInvoice(payload);
    if (!result.success) return result;
  }
  return { success: true };
}
