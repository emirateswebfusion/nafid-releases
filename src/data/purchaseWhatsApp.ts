import { listParties, partiesApi } from './parties';
import { getSetting } from './settings';
import { whatsappApi } from './whatsapp';
import { isLedgerRecipientAllowed } from './whatsappSharing';
import { formatWhatsAppLedgerTxMessage } from '../utils/print/whatsappBillHelper';
import type { PurchaseBillsRow } from './dbRows';

export async function sendPurchaseWhatsApp(bill: PurchaseBillsRow) {
  if (!bill.supplier_id) throw new Error('This purchase has no linked supplier account.');
  const parties = await listParties(bill.tenant_id);
  const supplier = parties.find(p => p.party_id === bill.supplier_id);
  if (!supplier?.phone?.trim()) throw new Error('Supplier phone number is missing.');
  if (!await isLedgerRecipientAllowed(bill.tenant_id, supplier)) throw new Error('This party type is excluded in WhatsApp settings.');
  const ledger = await partiesApi.getPartyLedger(bill.supplier_id);
  const matches = ledger.filter(entry => !entry.is_deleted && entry.reference_number === bill.bill_number && (entry.balance_type || 'GST') === (bill.bill_type === 'ESTIMATE' ? 'ESTIMATE' : 'GST') && /^purchase bill\b/i.test(entry.description));
  if (matches.length !== 1) throw new Error('A unique purchase ledger entry is required to share accurate balances. Cash purchases do not create a supplier ledger entry.');
  const entry = matches[0];
  const [includeShop, shopName] = await Promise.all([
    getSetting({ tenant_id: bill.tenant_id, key: 'ledger_whatsapp_include_shop' }),
    getSetting<string>({ tenant_id: bill.tenant_id, key: 'shop_name' }),
  ]);
  return whatsappApi.sendInvoice({ phone: supplier.phone.trim(), message: formatWhatsAppLedgerTxMessage({
    openingBalance: entry.running_balance - entry.credit_amount + entry.debit_amount,
    amount: entry.debit_amount, newBalance: entry.running_balance,
    paymentMethod: entry.payment_method || 'CREDIT', description: entry.description,
    includeShopName: includeShop === true || includeShop === 'true', shopName: shopName || undefined,
  }) });
}
