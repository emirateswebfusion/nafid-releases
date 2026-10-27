import { useCartStore } from '../../../store/cartStore';
import { v4 as uuidv4 } from 'uuid';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../../../utils/print/receiptGenerator';
import { formatPrinterError } from '../../../utils/print/printFormatHelper';
import { useTabStore } from '../../../store/tabStore';
import { cashierApi } from '../../../data/cashier';
import { isDesktopRuntime } from '../../../data/client';
import { printingApi } from '../../../data/printing';
import { scrapApi } from '../../../data/scrap';
import { getSetting, type ReceiptPrinterConfig, type PrintFormatSettings } from '../../../data/settings';
import { resolveLinePrice } from '../../../utils/pricing/linePricing';
import type { CheckoutContext } from './checkoutHandler';

/**
 * Scrap-mode checkout: saves (or updates) the scrap purchase invoice, records CREDIT in the party ledger,
 * logs the cash payout, prints the scrap receipt and resets the tab. Called by createCheckoutHandler.
 * Returns early on validation/persistence errors after reporting them through ctx.setHardwareError.
 */
export async function runScrapCheckout(ctx: CheckoutContext, run: { saveOnly: boolean; checkoutTabId: string; editingInvoiceNumber: string | null }) {
  const { items, setHardwareError, scrapTotal, extraBonus, scrapPaymentStatus, customerName, customerPhone, tenantId, customerAddress, userId, userName, shopNameState, shopName, shopGstin, shopAddress, shopPhone, authRole, discount, customerState, setCheckoutSuccess, uiConfig, setIsScrapMode, closeTab, clearCart, updateActiveTab, isCashSettlementEnabled, reserveScrapInvoiceNumberForTab, reserveInvoiceNumberForTab, getActiveTab, syncActiveSnapshot } = ctx;
  const { saveOnly, checkoutTabId, editingInvoiceNumber } = run;
  let scrapPrintSuccess: boolean;
  let scrapInvoiceNum = editingInvoiceNumber;
  const finalScrapGrandTotal = scrapTotal + extraBonus;

  if (scrapPaymentStatus === 'CREDIT') {
    if (!customerName.trim() || !customerPhone.trim()) {
      setHardwareError('Please enter Customer Name and Phone Number for Credit payment');
      return;
    }
  }

  if (editingInvoiceNumber) {
    const scrapItemsForUpdate = items.map(item => {
      const rawRate = item.base_price;
      const effectiveRateInfo = resolveLinePrice(item, rawRate, 'scrap');
      const effectiveRate = effectiveRateInfo.unitRate;
      return {
        scrap_category_id: item.scrap_category_id || item.product_id,
        quantity: Number(item.quantity) || 0,
        rate: Math.max(effectiveRate, 0),
        notes: '',
      };
    });

    const result = await scrapApi.updateScrapInvoiceFull({
      tenant_id: tenantId || 'global',
      scrap_invoice_number: editingInvoiceNumber,
      party_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_address: customerAddress || null,
      payment_status: scrapPaymentStatus,
      items: scrapItemsForUpdate,
    });

    if (!result.success) {
      setHardwareError(`Failed to update scrap invoice: ${result.error}`);
      return;
    }
  } else {
    const numRes = await scrapApi.getNextScrapInvoiceNumber({ tenant_id: 'global' });
    if (!numRes.success || !numRes.invoiceNumber) {
      setHardwareError('Failed to generate scrap invoice number');
      return;
    }
    scrapInvoiceNum = numRes.invoiceNumber;

    for (const item of items) {
      const rawRate = item.base_price;
      const effectiveRateInfo = resolveLinePrice(item, rawRate, 'scrap');
      const effectiveRate = effectiveRateInfo.unitRate;
      const qty = Number(item.quantity) || 0;
      const totalAmount = effectiveRate * qty;

      const result = await scrapApi.addScrapTransaction({
        transaction_id: uuidv4(),
        tenant_id: tenantId || 'unset',
        type: 'PURCHASE',
        scrap_category_id: item.scrap_category_id,
        quantity: qty,
        rate: effectiveRate,
        total_amount: totalAmount,
        party_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_address: customerAddress || null,
        notes: '',
        scrap_invoice_number: scrapInvoiceNum || '',
        payment_status: scrapPaymentStatus,
      });
      if (!result.success) {
        setHardwareError(`Failed to save scrap item: ${result.error}`);
        return;
      }
    }
  }

  // CREDIT scrap → record in party ledger (idempotent per invoice; non-CREDIT removes it)
  await scrapApi.upsertScrapCreditLedger({
    tenant_id: tenantId || 'unset',
    scrap_invoice_number: scrapInvoiceNum || '',
    payment_status: scrapPaymentStatus,
    party_name: customerName || null,
    customer_phone: customerPhone || null,
    customer_address: customerAddress || null,
    user_id: userId || undefined,
    user_name: userName || undefined,
  }).catch(() => {});

  // Print scrap receipt (skip if saveOnly)
  scrapPrintSuccess = true;
  if (!saveOnly) {
    const cfg = await getSetting<ReceiptPrinterConfig>({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
    const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;
    const printFmt = await getSetting<PrintFormatSettings>({ tenant_id: tenantId || 'global', key: 'print_format' });
    const thermalWidth = printFmt?.width ? Number(printFmt.width) / 10 : width;
    const thermalStyle = printFmt?.style || 'standard';

    // Group scrap items by category for receipt
    const scrapGrouped = items.reduce((acc, item) => {
      const key = item.scrap_category_id || item.product_id;
      const rawRate = item.base_price;
      const effectiveRateInfo = resolveLinePrice(item, rawRate, 'scrap');
      const effectiveRate = effectiveRateInfo.unitRate;
      const qty = Number(item.quantity) || 0;

      if (!acc[key]) {
        acc[key] = { name: item.name, quantity: 0, unit_price: effectiveRate, total: 0 };
      }
      acc[key].quantity += qty;
      acc[key].total += effectiveRate * qty;
      if (acc[key].quantity > 0) {
        acc[key].unit_price = acc[key].total / acc[key].quantity;
      }
      return acc;
    }, {} as Record<string, { name: string; quantity: number; unit_price: number; total: number }>);
    const scrapReceiptItems = Object.values(scrapGrouped).map(item => ({
      name: item.name,
      quantity: item.quantity.toFixed(3),
      unit_price: item.unit_price,
      total: item.total,
    }));

    const scrapBillSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt?.scrapBillSettings || {}) };
    const cartState = useCartStore.getState();
    const receiptData: ReceiptData = {
      shopName: scrapBillSettings.showShopName !== false ? (shopNameState || shopName || 'My Shop') : '',
      shopGstin: scrapBillSettings.showShopGstin !== false ? (shopGstin || undefined) : undefined,
      shopAddress: scrapBillSettings.showShopAddress !== false ? (shopAddress || undefined) : undefined,
      shopPhone: scrapBillSettings.showPhone !== false ? (shopPhone || undefined) : undefined,
      upiId: undefined,
      showUpiQr: false,
      showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
      showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
      invoiceNumber: scrapInvoiceNum || '',
      invoiceType: 'SCRAP',
      date: formatBillDateTime(new Date()),
      billerName: scrapBillSettings.showBillerName !== false ? (userName || authRole || undefined) : undefined,
      items: scrapReceiptItems,
      subtotal: scrapTotal,
      tax: 0,
      discount: discount,
      discountType: cartState.discountType,
      discountValue: cartState.discountValue,
      grandTotal: finalScrapGrandTotal,
      extraBonus: extraBonus,
      customerName: scrapBillSettings.showCustomerName !== false ? (customerName || undefined) : undefined,
      customerPhone: scrapBillSettings.showCustomerPhone !== false ? (customerPhone || undefined) : undefined,
      customerAddress: scrapBillSettings.showCustomerAddress !== false ? (customerAddress || undefined) : undefined,
      customerState: scrapBillSettings.showCustomerState !== false ? (customerState || undefined) : undefined,
      billSettings: scrapBillSettings,
    };

    const scrapReceiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
    const printResult = await printingApi.printReceipt(tenantId || 'global', scrapReceiptText);
    if (printResult?.skipped) {
      scrapPrintSuccess = false;
      setHardwareError(formatPrinterError('No printer configured'));
      setTimeout(() => setHardwareError(null), 5000);
    } else if (printResult && !printResult.success) {
      scrapPrintSuccess = false;
      setHardwareError(formatPrinterError(printResult.error));
      setTimeout(() => setHardwareError(null), 5000);
    }
  }

  // Cash drawer: record CASH_OUT for scrap cash payments
  if (scrapPaymentStatus === 'CASH' && isDesktopRuntime()) {
    await cashierApi.addTransaction({
      tenant_id: tenantId || 'unset',
      type: 'CASH_OUT',
      amount: finalScrapGrandTotal,
      category: 'Scrap Purchase',
      notes: `Scrap purchase ${scrapInvoiceNum}`,
      user_id: userId || 'unset',
      user_name: userName || undefined,
    }).catch(() => {});
  }

  setCheckoutSuccess(saveOnly || !scrapPrintSuccess ? 'saved' : 'printed');
  setTimeout(async () => {
    const tabsCount = useTabStore.getState().tabs.length;
    const targetTabId = checkoutTabId;
    const stayInScrap = uiConfig.stayInScrapModeAfterPrint ?? false;

    if (tabsCount > 1 && !stayInScrap) {
      setIsScrapMode(false);
      closeTab(targetTabId);
    } else {
      clearCart();
      useCartStore.getState().setEditingInvoice(null, null, null);
      updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', receivedAmount: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '' });

      if (stayInScrap) {
        setIsScrapMode(true);
        await reserveScrapInvoiceNumberForTab(true);
      } else {
        setIsScrapMode(false);
        await Promise.all([reserveScrapInvoiceNumberForTab(true), reserveInvoiceNumberForTab(true)]);
        const tab = getActiveTab();
        if (tab?.reservedInvoiceNumber) {
          updateActiveTab({ title: tab.reservedInvoiceNumber });
        }
      }
      syncActiveSnapshot();
    }
    setCheckoutSuccess(false); // scrap mode reset
  }, 1800);
}
