import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { settingsApi } from '../../../data/settings';
import { parsePrintFormat, formatPrinterError } from '../../../utils/printFormatHelper';
import { DEFAULT_BILL_SETTINGS, type ReceiptData, formatBillDateTime, generateReceiptText } from '../../../utils/receiptGenerator';
import { generateInvoiceHtml } from '../../../utils/invoiceHtmlGenerator';
import { printingApi } from '../../../data/printing';
import { scrapApi } from '../../../data/scrap';
import { v4 as uuidv4 } from 'uuid';
import type { View, ScrapCategory } from '../scrapTypes';
import type { ScrapInvoiceRow, ScrapInvoiceTxRow } from '../scrapTypes';

export interface UseScrapInvoiceActionsContext {
  addItemForm: { categoryId: string; quantity: string; rate: string; notes: string; };
  categories: ScrapCategory[];
  editHeaderForm: { party_name: string; customer_phone: string; customer_address: string; payment_status: string; };
  editHeaderInvoice: ScrapInvoiceRow | null;
  editingTxItem: ScrapInvoiceTxRow | null;
  editTxForm: { scrap_category_id: string; quantity: string; rate: string; party_name: string; notes: string; };
  invoiceDetailTxs: ScrapInvoiceTxRow[];
  loadData: () => Promise<void>;
  loadInvoices: () => Promise<void>;
  loadTransactions: (categoryId?: string) => Promise<void>;
  openInvoiceDetail: (invoiceNumber: string) => Promise<void>;
  selectedCategory: ScrapCategory | null;
  selectedInvoiceNumber: string;
  setAddItemForm: React.Dispatch<React.SetStateAction<{ categoryId: string; quantity: string; rate: string; notes: string; }>>;
  setEditHeaderInvoice: React.Dispatch<React.SetStateAction<ScrapInvoiceRow | null>>;
  setEditingTxItem: React.Dispatch<React.SetStateAction<ScrapInvoiceTxRow | null>>;
  setEditTxForm: React.Dispatch<React.SetStateAction<{ scrap_category_id: string; quantity: string; rate: string; party_name: string; notes: string; }>>;
  setInvoiceDetailTxs: React.Dispatch<React.SetStateAction<ScrapInvoiceTxRow[]>>;
  setIsAddingItem: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAddingItemSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingHeader: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSavingTx: React.Dispatch<React.SetStateAction<boolean>>;
  setReprintSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  view: View;
}

/**
 * Scrap invoice actions: reprint (A4 or receipt), save an edited transaction line, save the invoice header (and its
 * credit ledger entry) and add a line to a saved invoice.
 */
export function useScrapInvoiceActions(ctx: UseScrapInvoiceActionsContext) {
  const { addItemForm, categories, editHeaderForm, editHeaderInvoice, editingTxItem, editTxForm, invoiceDetailTxs, loadData, loadInvoices, loadTransactions, openInvoiceDetail, selectedCategory, selectedInvoiceNumber, setAddItemForm, setEditHeaderInvoice, setEditingTxItem, setEditTxForm, setInvoiceDetailTxs, setIsAddingItem, setIsAddingItemSaving, setIsSavingHeader, setIsSavingTx, setReprintSuccess, showStatus, tenantId, view } = ctx;
  const handleReprintScrap = async () => {
    if (!selectedInvoiceNumber || invoiceDetailTxs.length === 0 || !isDesktopRuntime()) return;
    try {
      const { tenantId } = useAuthStore.getState();
      const [shopNameVal, shopAddr, shopPh, upi, showQr, shopGstin] = await Promise.all([
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_name' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_address' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_phone' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'upi_id' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'show_upi_qr' }),
        settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
      ]);
      const receiptConfig = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const receiptWidthCm = receiptConfig?.receiptWidthCm ? Number(receiptConfig.receiptWidthCm) : 5.8;
      const printFmtRaw = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const useA4 = isA4 || isHalfA4;

      const scrapItems = invoiceDetailTxs.map((tx: ScrapInvoiceTxRow) => ({
        name: tx.scrap_category_name || 'Unknown',
        quantity: Number(tx.quantity).toFixed(3),
        unit_price: Number(tx.rate),
        total: Number(tx.total_amount),
        billing_type: 'WEIGHT',
      }));

      const totalAmount = invoiceDetailTxs.reduce((sum: number, tx: ScrapInvoiceTxRow) => sum + Number(tx.total_amount), 0);

      const scrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.scrapBillSettings || {}) };
      const receiptData: ReceiptData = {
        shopName: scrapBillSettings.showShopName !== false ? (shopNameVal || useAuthStore.getState().shopName || 'My Shop') : '',
        shopGstin: scrapBillSettings.showShopGstin !== false ? (shopGstin || undefined) : undefined,
        shopAddress: scrapBillSettings.showShopAddress !== false ? (shopAddr || undefined) : undefined,
        shopPhone: scrapBillSettings.showPhone !== false ? (shopPh || undefined) : undefined,
        upiId: upi || undefined,
        showUpiQr: showQr !== null && showQr !== undefined ? Boolean(showQr) : true,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        invoiceNumber: selectedInvoiceNumber,
        invoiceType: 'SCRAP',
        date: formatBillDateTime(invoiceDetailTxs[0]?.created_at || Date.now()),
        billerName: scrapBillSettings.showBillerName !== false ? (invoiceDetailTxs[0]?.biller_name || useAuthStore.getState().userName || undefined) : undefined,
        items: scrapItems,
        subtotal: totalAmount,
        tax: 0,
        discount: 0,
        grandTotal: totalAmount,
        isReprint: true,
        customerName: scrapBillSettings.showCustomerName !== false ? (invoiceDetailTxs[0]?.party_name || undefined) : undefined,
        customerPhone: scrapBillSettings.showCustomerPhone !== false ? (invoiceDetailTxs[0]?.party_phone || invoiceDetailTxs[0]?.customer_phone || undefined) : undefined,
        customerAddress: scrapBillSettings.showCustomerAddress !== false ? (invoiceDetailTxs[0]?.party_address || invoiceDetailTxs[0]?.customer_address || undefined) : undefined,
        customerState: scrapBillSettings.showCustomerState !== false ? (invoiceDetailTxs[0]?.party_state || invoiceDetailTxs[0]?.customer_state || undefined) : undefined,
        billSettings: scrapBillSettings,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
      };

      if (useA4) {
        const invoiceStyle = isHalfA4 ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
        const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as Parameters<typeof generateInvoiceHtml>[1]);
        const printResult = await printingApi.printA4Html(tenantId || 'global', invoiceHtml);
        if (printResult && !printResult.success) {
          showStatus(formatPrinterError(printResult.error), 'error');
        } else {
          setReprintSuccess(true);
        }
      } else {
        const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : receiptWidthCm;
        const thermalStyle = printFmt?.thermalStyle || (printFmt?.format === 'thermal' ? printFmt.style : undefined) || 'standard';
        const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
        const printResult = await printingApi.printReceipt(tenantId || 'global', receiptText);
        if (printResult?.skipped) {
          showStatus(formatPrinterError('No printer configured'), 'error');
        } else if (printResult && !printResult.success) {
          showStatus(formatPrinterError(printResult.error), 'error');
        } else {
          setReprintSuccess(true);
        }
      }
    } catch (err) {
      console.error('Failed to reprint scrap invoice', err);
      showStatus('Failed to reprint: ' + ((err as Error)?.message || 'Unknown error'), 'error');
    }
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxItem) return;
    if (!editTxForm.quantity || !editTxForm.rate) { showStatus('Quantity and Rate are required', 'error'); return; }
    setIsSavingTx(true);
    try {
      const res = await scrapApi.updateScrapTransaction({
        transaction_id: editingTxItem.transaction_id,
        tenant_id: tenantId,
        scrap_category_id: editTxForm.scrap_category_id,
        quantity: Number(editTxForm.quantity),
        rate: Number(editTxForm.rate),
        party_name: editTxForm.party_name,
        notes: editTxForm.notes,
      });
      if (res.success) {
        showStatus('Line item updated successfully', 'success');
        setEditingTxItem(null);
        setEditTxForm({ scrap_category_id: '', quantity: '', rate: '', party_name: '', notes: '' });
        if (selectedInvoiceNumber) {
          const detail = await scrapApi.getScrapInvoiceByNumber({ tenant_id: tenantId || '', scrap_invoice_number: selectedInvoiceNumber }) as import('../../../data/scrap').ScrapInvoiceDetails | null;
          if (detail && detail.transactions) setInvoiceDetailTxs(detail.transactions);
        } else if (selectedCategory) {
          await loadTransactions(selectedCategory.scrap_category_id);
        }
        await loadInvoices();
        await loadData();
      } else {
        showStatus(res.error || 'Update failed', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  const handleSaveInvoiceHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHeaderInvoice || !isDesktopRuntime()) return;
    setIsSavingHeader(true);
    try {
      const res = await scrapApi.updateScrapInvoiceHeader({
        tenant_id: tenantId || '',
        scrap_invoice_number: editHeaderInvoice.invoice_number || editHeaderInvoice.scrap_invoice_number,
        party_name: editHeaderForm.party_name,
        customer_phone: editHeaderForm.customer_phone,
        customer_address: editHeaderForm.customer_address,
        payment_status: editHeaderForm.payment_status,
      });
      if (res.success) {
        showStatus('Invoice customer info updated successfully', 'success');
        const invNum = editHeaderInvoice.invoice_number || (editHeaderInvoice.scrap_invoice_number as string);
        await scrapApi.upsertScrapCreditLedger({
          tenant_id: tenantId || '',
          scrap_invoice_number: invNum,
          payment_status: editHeaderForm.payment_status,
          party_name: editHeaderForm.party_name || null,
          customer_phone: editHeaderForm.customer_phone || null,
          customer_address: editHeaderForm.customer_address || null,
          user_id: undefined,
          user_name: undefined,
        }).catch(() => {});
        setEditHeaderInvoice(null);
        await loadInvoices();
        if (view === 'invoice_detail' && selectedInvoiceNumber === invNum) {
          await openInvoiceDetail(invNum);
        }
      } else {
        showStatus(res.error || 'Failed to update invoice info', 'error');
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingHeader(false);
    }
  };

  const handleAddLineItemToInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceNumber || !addItemForm.categoryId || !addItemForm.quantity || !addItemForm.rate) {
      showStatus('Category, Quantity, and Rate are required', 'error');
      return;
    }
    const cat = categories.find(c => c.scrap_category_id === addItemForm.categoryId);
    if (!cat) {
      showStatus('Category not found', 'error');
      return;
    }
    const qty = Number(addItemForm.quantity);
    const rate = Number(addItemForm.rate);
    const firstTx = invoiceDetailTxs[0];

    setIsAddingItemSaving(true);
    try {
      if (isDesktopRuntime()) {
        const res = await scrapApi.addScrapTransaction({
          transaction_id: uuidv4(),
          tenant_id: tenantId,
          type: 'PURCHASE',
          scrap_category_id: addItemForm.categoryId,
          quantity: qty,
          rate: rate,
          total_amount: qty * rate,
          party_name: firstTx?.party_name || '',
          customer_phone: firstTx?.customer_phone || '',
          customer_address: firstTx?.customer_address || '',
          notes: addItemForm.notes || 'Added line item',
          scrap_invoice_number: selectedInvoiceNumber,
          payment_status: firstTx?.payment_status || 'CASH',
        });
        if (res.success) {
          showStatus(`Added ${qty} ${cat.unit} of ${cat.name} to invoice`, 'success');
          await scrapApi.upsertScrapCreditLedger({
            tenant_id: tenantId || '',
            scrap_invoice_number: selectedInvoiceNumber,
            payment_status: firstTx?.payment_status || 'CASH',
            party_name: firstTx?.party_name || null,
            customer_phone: firstTx?.customer_phone || null,
            customer_address: firstTx?.customer_address || null,
            user_id: undefined,
            user_name: undefined,
          }).catch(() => {});
          setIsAddingItem(false);
          setAddItemForm({ categoryId: '', quantity: '', rate: '', notes: '' });
          await openInvoiceDetail(selectedInvoiceNumber);
          await loadInvoices();
          await loadData();
        } else {
          showStatus(res.error || 'Failed to add line item', 'error');
        }
      }
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsAddingItemSaving(false);
    }
  };

  return { handleReprintScrap, handleSaveEditTx, handleSaveInvoiceHeader, handleAddLineItemToInvoice };
}
