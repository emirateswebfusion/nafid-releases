import { useAuthStore } from '../../../store/authStore';
import { hasBridge } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { returnsApi } from '../../../data/returns';
import { salesCloud } from '../../../data/cloud/sales';
import { scrapApi } from '../../../data/scrap';
import { generateReceiptText, formatBillDateTime } from '../../../utils/receiptGenerator';
import { printingApi } from '../../../data/printing';
import { hasPermission, isAdminRole } from '../../../utils/permissions';
import { useCartStore } from '../../../store/cartStore';
import type { LedgerEntry } from '../partyTypes';
import { formatDateTime } from '../partyFormat';
import type { PartyManagerState } from './usePartyManagerState';

export interface UsePartyBillPreviewContext {
  onClose: () => void;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  pm: PartyManagerState;
}

/**
 * Bill preview from a ledger entry: open the invoice / purchase bill behind an entry, print it, or open it for editing.
 */
export function usePartyBillPreview(ctx: UsePartyBillPreviewContext) {
  const { onClose, showStatus, tenantId } = ctx;
  const { selectedParty, setViewingBillLoading, setViewingBillModal, setViewingInvoice, setViewingInvoiceItems, setViewingLedgerVoucher, viewingInvoice, viewingInvoiceItems, viewingLedgerVoucher } = ctx.pm;
  const handleOpenBillForLedgerEntry = async (entry: LedgerEntry) => {
    setViewingInvoice(null);
    setViewingInvoiceItems([]);
    setViewingLedgerVoucher(null);
    setViewingBillModal(true);
    setViewingBillLoading(true);

    try {
      const tId = tenantId || useAuthStore.getState().tenantId;
      const candidateTerms: string[] = [];

      if (entry.reference_number?.trim()) {
        const ref = entry.reference_number.trim();
        candidateTerms.push(ref);
        const baseRef = ref.replace(/-(PAY|CASH|UPI|CARD|BANK|CHEQUE)$/i, '');
        if (baseRef !== ref && !candidateTerms.includes(baseRef)) {
          candidateTerms.push(baseRef);
        }
      }

      const fullText = `${entry.description || ''} ${entry.reference_number || ''}`;
      const matches = fullText.match(/(?:#|INV-|BOS-|PB-|SCRAP-|RET-|RTN-|Bill\s*#?|Invoice\s*#?|Estimate\s*#?)([A-Za-z0-9\-_]+)/gi);
      if (matches) {
        matches.forEach(m => {
          const cleaned = m.replace(/^(?:#|Bill\s*#?|Invoice\s*#?|Estimate\s*#?)/i, '').trim();
          if (cleaned && !candidateTerms.includes(cleaned)) {
            candidateTerms.push(cleaned);
          }
        });
      }

      let foundInvoice: any = null;
      let invoiceItems: any[] = [];

      for (const term of candidateTerms) {
        if (hasBridge('dbGetInvoices')) {
          const res = await invoicesApi.getInvoices({ search: term, tenant_id: tId });
          if (Array.isArray(res) && res.length > 0) {
            const match = res.find(inv =>
              String(inv.invoice_number).toLowerCase() === term.toLowerCase() ||
              String(inv.invoice_id).toLowerCase() === term.toLowerCase()
            ) || res[0];
            foundInvoice = match;
            break;
          }
        }
        if (!foundInvoice && hasBridge('dbGetReturnInvoiceByNumber') && (term.toUpperCase().startsWith('RTN-') || term.toUpperCase().startsWith('RET-'))) {
          try {
            const ret = await returnsApi.getReturnInvoiceByNumber({ tenant_id: tId as string, return_number: term });
            if (ret && ret.invoice_id) {
              const res = await invoicesApi.getInvoices({ search: ret.invoice_id, tenant_id: tId });
              if (Array.isArray(res) && res.length > 0) {
                foundInvoice = res.find((inv: any) => inv.invoice_id === ret.invoice_id) || res[0];
                break;
              }
            }
          } catch { /* ignore */ }
        }
        if (!foundInvoice) {
          try {
            const res = await salesCloud.search(term);
            const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
            if (list.length > 0) {
              foundInvoice = list[0];
              break;
            }
          } catch { /* ignore */ }
        }
      }

      if (!foundInvoice && selectedParty) {
        if (hasBridge('dbGetInvoices')) {
          const res = await invoicesApi.getInvoices({ tenant_id: tId, limit: 100 });
          if (Array.isArray(res)) {
            const entryAmt = entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount;
            const match = res.find(inv => {
              const isPartyMatch = inv.party_id === selectedParty.party_id ||
                (inv.customer_phone && selectedParty.phone && inv.customer_phone === selectedParty.phone) ||
                (inv.customer_name && selectedParty.name && inv.customer_name.toLowerCase().trim() === selectedParty.name.toLowerCase().trim());
              if (!isPartyMatch) return false;
              const invTotal = Number(inv.grand_total) || 0;
              return Math.abs(invTotal - entryAmt) < 0.01 ||
                (entry.reference_number && (
                  String(inv.invoice_number).includes(entry.reference_number) ||
                  entry.reference_number.startsWith(String(inv.invoice_number))
                ));
            });
            if (match) {
              foundInvoice = match;
            }
          }
        }
      }

      if (foundInvoice) {
        setViewingInvoice(foundInvoice);
        if (hasBridge('dbGetInvoiceItems')) {
          const items = await invoicesApi.getInvoiceItems(foundInvoice.invoice_id);
          if (Array.isArray(items)) invoiceItems = items;
        } else {
          try {
            const itemsRes = await salesCloud.items(foundInvoice.invoice_id);
            if (Array.isArray(itemsRes)) invoiceItems = itemsRes;
          } catch { /* ignore */ }
        }
        setViewingInvoiceItems(invoiceItems);
      } else {
        let foundScrap: any = null;
        for (const term of candidateTerms) {
          if (hasBridge('dbGetScrapInvoiceByNumber')) {
            const scrap = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tId as string, scrap_invoice_number: term });
            if (scrap && scrap.scrap_invoice_number) {
              foundScrap = scrap;
              break;
            }
          }
        }
        if (foundScrap) {
          setViewingInvoice({
            invoice_number: foundScrap.scrap_invoice_number,
            invoice_type: 'SCRAP',
            created_at: foundScrap.created_at || entry.transaction_date,
            payment_method: foundScrap.payment_status || 'COMPLETED',
            customer_name: foundScrap.party_name || selectedParty?.name,
            customer_phone: foundScrap.customer_phone || selectedParty?.phone,
            grand_total: foundScrap.total_amount || (entry.credit_amount || entry.debit_amount),
            subtotal: foundScrap.total_amount || (entry.credit_amount || entry.debit_amount),
          });
          setViewingInvoiceItems(foundScrap.items || []);
        } else {
          setViewingLedgerVoucher(entry);
        }
      }
    } catch (err) {
      console.error('Error fetching bill for ledger entry:', err);
      setViewingLedgerVoucher(entry);
    } finally {
      setViewingBillLoading(false);
    }
  };

  const handlePrintBillInModal = async () => {
    if (viewingInvoice) {
      if (hasBridge('printReceipt')) {
        try {
          const tId = tenantId || 'global';
          const receiptText = generateReceiptText({
            shopName: useAuthStore.getState().shopName || 'Store',
            invoiceNumber: viewingInvoice.invoice_number,
            date: formatBillDateTime(viewingInvoice.created_at),
            items: (viewingInvoiceItems || []).map(i => ({
              name: i.name,
              quantity: Number(i.quantity) || 1,
              unit_price: Number(i.unit_price) || 0,
              total: Number(i.total) || (Number(i.quantity) * Number(i.unit_price)) || 0,
              qty: Number(i.quantity) || 1,
              unitPrice: Number(i.unit_price) || 0,
              totalPrice: Number(i.total) || (Number(i.quantity) * Number(i.unit_price)) || 0,
            })),
            grandTotal: Number(viewingInvoice.grand_total) || 0,
            subtotal: Number(viewingInvoice.subtotal) || 0,
            tax: Number(viewingInvoice.tax_amount || viewingInvoice.tax || 0),
            discount: Number(viewingInvoice.discount_amount || viewingInvoice.discount || 0),
            paymentMethod: viewingInvoice.payment_method || 'CASH',
          });
          await printingApi.printReceipt(tId, receiptText);
          showStatus('Receipt sent to printer', 'success');
        } catch {
          showStatus('Failed to print receipt', 'error');
        }
      }
    } else if (viewingLedgerVoucher) {
      if (hasBridge('printReceipt')) {
        try {
          const tId = tenantId || 'global';
          const amt = viewingLedgerVoucher.credit_amount > 0 ? viewingLedgerVoucher.credit_amount : viewingLedgerVoucher.debit_amount;
          const receiptText = `================================\n        PAYMENT VOUCHER         \n================================\nRef #: ${viewingLedgerVoucher.reference_number || viewingLedgerVoucher.ledger_id.slice(0, 8)}\nDate: ${formatDateTime(viewingLedgerVoucher.transaction_date)}\nParty: ${selectedParty?.name || ''}\nPhone: ${selectedParty?.phone || ''}\nType: ${viewingLedgerVoucher.credit_amount > 0 ? 'CREDIT SALE (GIVEN)' : 'PAYMENT (RECEIVED)'}\nPayment Mode: ${viewingLedgerVoucher.payment_method || 'CASH'}\n--------------------------------\nAmount: RS. ${amt.toFixed(2)}\nRunning Bal: RS. ${Math.abs(viewingLedgerVoucher.running_balance).toFixed(2)}\nNote: ${viewingLedgerVoucher.description || ''}\n================================\n`;
          await printingApi.printReceipt(tId, receiptText);
          showStatus('Voucher sent to printer', 'success');
        } catch {
          showStatus('Failed to print voucher', 'error');
        }
      }
    }
  };

  const handleEditBillFromModal = async () => {
    if (!viewingInvoice) return;
    const { role, permissions } = useAuthStore.getState();
    if (!hasPermission({ role, permissions }, 'sales.edit')) {
      showStatus('Permission Denied: You do not have permission to edit bills', 'error');
      return;
    }
    try {
      let itemsToEdit = viewingInvoiceItems;
      if (!itemsToEdit || itemsToEdit.length === 0) {
        if (hasBridge('dbGetInvoiceItems')) {
          const data = await invoicesApi.getInvoiceItems(viewingInvoice.invoice_id);
          itemsToEdit = Array.isArray(data) ? data : [];
        }
      }
      localStorage.setItem('editBillData', JSON.stringify({
        invoice: viewingInvoice,
        items: itemsToEdit,
        originalRole: useAuthStore.getState().role || 'OWNER',
      }));
      setViewingBillModal(false);
      onClose();
      if (isAdminRole(useAuthStore.getState().role)) {
        useCartStore.getState().setRole('BILLER');
      }
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-edit-bill')), 50);
    } catch (e) {
      console.error('Failed to start bill edit:', e);
      showStatus('Failed to open bill editor', 'error');
    }
  };

  return { handleOpenBillForLedgerEntry, handlePrintBillInModal, handleEditBillFromModal };
}
