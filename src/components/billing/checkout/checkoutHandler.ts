import type * as B from '../billingTypes';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import type { CartItem, InvoiceType } from '../../../store/cartStore';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import type { Tab } from '../../../store/tabStore';
import type { PaymentMethod } from '../BillingConstants';
import { runScrapCheckout } from './scrapCheckout';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { generateReceiptText, DEFAULT_BILL_SETTINGS, formatBillDateTime, type ReceiptData } from '../../../utils/print/receiptGenerator';
import { generateInvoiceHtml } from '../../../utils/print/invoiceHtmlGenerator';
import { formatWhatsAppBillMessage } from '../../../utils/print/whatsappBillHelper';
import { parsePrintFormat, formatPrinterError } from '../../../utils/print/printFormatHelper';
import { useTabStore, type SplitDetails } from '../../../store/tabStore';
import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { buildCheckoutLines, buildReceiptLines, resolveSupplyType } from '../../../utils/pricing/checkoutLines';
import { cashierApi } from '../../../data/cashier';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { invoicesApi } from '../../../data/invoices';
import { printingApi } from '../../../data/printing';
import { quotationsApi } from '../../../data/quotations';
import { returnsApi } from '../../../data/returns';
import { sendConfiguredBill } from '../../../data/whatsappSharing';
import { getSetting, type ReceiptPrinterConfig, type PrintFormatSettings } from '../../../data/settings';
import { listParties } from '../../../data/parties';

export interface CheckoutContext {
  items: CartItem[];
  setHardwareError: Dispatch<SetStateAction<string | null>>;
  isCheckingOutRef: RefObject<boolean>;
  activeTabId: string;
  setIsCheckingOut: Dispatch<SetStateAction<boolean>>;
  isScrapMode: boolean;
  scrapTotal: number;
  extraBonus: number;
  scrapPaymentStatus: "CASH" | "CREDIT" | "PENDING" | "SETTLED";
  customerName: string;
  customerPhone: string;
  tenantId: string | null;
  customerAddress: string;
  userId: string;
  userName: string | null;
  shopNameState: string;
  shopName: string | null;
  shopGstin: string;
  shopAddress: string;
  shopPhone: string;
  authRole: "ADMIN" | "SUPER_ADMIN" | "STAFF" | null;
  discount: number;
  customerState: string;
  setCheckoutSuccess: Dispatch<SetStateAction<false | "saved" | "printed">>;
  uiConfig: BillingUIConfig;
  setIsScrapMode: (isScrapMode: boolean) => void;
  closeTab: (id: string) => void;
  clearCart: () => void;
  updateActiveTab: (updates: Partial<Omit<Tab, "id" | "snapshot">>) => void;
  isCashSettlementEnabled: boolean;
  reserveScrapInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  reserveInvoiceNumberForTab: (forceRefresh?: boolean) => Promise<void>;
  getActiveTab: () => Tab | undefined;
  syncActiveSnapshot: () => void;
  pendingCheckoutSaveOnlyRef: RefObject<boolean | null>;
  setIsBillerPinModalOpen: Dispatch<SetStateAction<boolean>>;
  pcsRefs: RefObject<Record<string, HTMLInputElement | null>>;
  qtyRefs: RefObject<Record<string, HTMLInputElement | null>>;
  localPcsStr: Record<string, string>;
  invoiceType: InvoiceType;
  isB2B: boolean;
  isQuotationMode: boolean;
  isReturnMode: boolean;
  customerGstin: string;
  paymentMethod: PaymentMethod;
  splitDetails: SplitDetails;
  splitTotal: number;
  displayGrandTotal: number;
  loyaltyEnabled: boolean;
  pointsToRedeem: number;
  loyaltyCustomerData: { customerId: string | null; pointsBalance: number; };
  loyaltyRedemptionRate: number;
  receivedAmount: number;
  refundAmount: number;
  balanceAmount: number;
  enableThreeInvoiceSeries: boolean;
  terminalCodeState: string;
  bosTaxRatePercent: number;
  bosTaxInclusive: boolean;
  loyaltyAwardOnPending: boolean;
  loyaltyEarningRate: number;
  isGrandTotalOverridden: boolean;
  activeTab: Tab | undefined;
  storeScrapDeduction: number;
  storeReturnDeduction: number;
  grandTotal: number;
  findMatchingParty: B.PartyMatch;
  shopEmail: string;
  shopWebsite: string;
  bankNameState: string;
  bankAccountState: string;
  bankIfscState: string;
  bankBranchState: string;
  upiId: string;
  showUpiQr: boolean;
  subtotal: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  storeScrapInvoiceNumber: string;
  storeReturnInvoiceNumber: string;
  currentSelectedUpi: B.SelectedUpi;
  actualRefundPaid: number;
  returnConsumed: number;
  editingQuotationId: string | null;
  setPartiesForTier: Dispatch<SetStateAction<B.Party[]>>;
  setInvoiceType: (type: InvoiceType) => void;
  clearScrapDeduction: () => void;
  clearReturnDeduction: () => void;
  setLoyaltyCustomerData: Dispatch<SetStateAction<{ customerId: string | null; pointsBalance: number; }>>;
  setShowLoyaltyRedemption: Dispatch<SetStateAction<boolean>>;
  setPointsToRedeem: Dispatch<SetStateAction<number>>;
}

export function createCheckoutHandler(ctx: CheckoutContext) {
  const { items, setHardwareError, isCheckingOutRef, activeTabId, setIsCheckingOut, isScrapMode, customerName, customerPhone, tenantId, customerAddress, userId, shopNameState, shopName, shopGstin, shopAddress, shopPhone, authRole, discount, customerState, setCheckoutSuccess, closeTab, clearCart, updateActiveTab, isCashSettlementEnabled, reserveInvoiceNumberForTab, getActiveTab, syncActiveSnapshot, pendingCheckoutSaveOnlyRef, setIsBillerPinModalOpen, pcsRefs, qtyRefs, localPcsStr, invoiceType, isB2B, isQuotationMode, isReturnMode, customerGstin, paymentMethod: tabPaymentMethod, splitDetails: tabSplitDetails, splitTotal, displayGrandTotal, loyaltyEnabled, pointsToRedeem, loyaltyCustomerData, loyaltyRedemptionRate, receivedAmount, refundAmount, balanceAmount, enableThreeInvoiceSeries, terminalCodeState, bosTaxRatePercent, bosTaxInclusive, loyaltyAwardOnPending, loyaltyEarningRate, isGrandTotalOverridden, activeTab, storeScrapDeduction, storeReturnDeduction, grandTotal, findMatchingParty, shopEmail, shopWebsite, bankNameState, bankAccountState, bankIfscState, bankBranchState, upiId, showUpiQr, subtotal, totalTax, cgst, sgst, igst, storeScrapInvoiceNumber, storeReturnInvoiceNumber, currentSelectedUpi, actualRefundPaid, returnConsumed, editingQuotationId, setPartiesForTier, setInvoiceType, clearScrapDeduction, clearReturnDeduction, setLoyaltyCustomerData, setShowLoyaltyRedemption, setPointsToRedeem } = ctx;
  // Credit mode with amounts in the Cash / Card / UPI / Cheque tiles is a split payment: save it as SPLIT with each
  // part kept and the rest on credit. (Saved as CREDIT, the parts collapsed into one "received" amount that every
  // report and the ledger count as cash.)
  const creditModeParts = tabPaymentMethod === 'CREDIT' ? splitTotal : 0;
  const paymentMethod: PaymentMethod = creditModeParts > 0 ? 'SPLIT' : tabPaymentMethod;
  const splitDetails: SplitDetails = creditModeParts > 0
    ? { ...tabSplitDetails, credit: Math.max(0, Math.round((displayGrandTotal - creditModeParts) * 100) / 100) }
    : tabSplitDetails;
  return async (saveOnly = false) => {
    if (items.length === 0) {
      setHardwareError('Cart is empty. Add items to checkout.');
      setTimeout(() => setHardwareError(null), 4000);
      return;
    }
    if (!isDesktopRuntime()) return;
    if (isCheckingOutRef.current) return;
    isCheckingOutRef.current = true;

    const checkoutTabId = activeTabId;
    let printSuccess: boolean;

    const cartStore = useCartStore.getState();
    const editingInvoiceId = cartStore.editingInvoiceId;
    const editingInvoiceNumber = cartStore.editingInvoiceNumber;
    const editingInvoiceRole = cartStore.editingInvoiceRole;

    setIsCheckingOut(true);
    setHardwareError(null);

    try {
      if (isScrapMode) {
        await runScrapCheckout(ctx, { saveOnly, checkoutTabId, editingInvoiceNumber });
        return;
      }

      // ── Normal Mode Checkout ──
      const flags = useFeatureFlagsStore.getState().flags;
      if (flags?.biller_pin && !useCartStore.getState().billerStaffId) {
        pendingCheckoutSaveOnlyRef.current = saveOnly;
        setIsBillerPinModalOpen(true);
        return;
      }
      // Read PCS directly from DOM input elements (100% reliable — avoids ALL React state closure/batching issues)
      const pcsSnapshot: Record<string, number> = {};
      const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        const domInput = isPiecesWeight ? pcsRefs.current[item.product_id] : qtyRefs.current[item.product_id];
        if (domInput) {
          const domVal = domInput.value.replace(/[^\d]/g, '');
          const parsed = parseInt(domVal, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            pcsSnapshot[item.product_id] = parsed;
            return;
          }
        }
        const strVal = localPcsStr[item.product_id];
        if (strVal !== undefined && strVal !== '') {
          const parsed = parseInt(strVal, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            pcsSnapshot[item.product_id] = parsed;
            return;
          }
        }
        pcsSnapshot[item.product_id] = item.pieces_override ?? 1;
      });

      if (invoiceType === 'GST' && isB2B && !isQuotationMode && !isReturnMode && !isScrapMode) {
        if (!(customerGstin || '').trim()) {
          setHardwareError('Customer GSTIN is required for B2B GST Tax Invoices under GST rules.');
          return;
        }
        if (!(customerName || '').trim() || !(customerPhone || '').trim() || !(customerAddress || '').trim()) {
          setHardwareError('Customer Name, Mobile Phone, and Address are required for GST Tax Invoices under GST rules.');
          return;
        }
      }

      if (paymentMethod === 'CREDIT' || (paymentMethod === 'SPLIT' && (Number(splitDetails?.credit) || 0) > 0)) {
        if (!(customerName || '').trim() || !(customerPhone || '').trim()) {
          setHardwareError('Please enter Customer Name and Phone Number for Credit');
          return;
        }
      }

      if (paymentMethod === 'SPLIT') {
        const totalSplitEntered = splitTotal + (Number(splitDetails?.credit) || 0);
        if (totalSplitEntered <= 0) {
          setHardwareError('Please enter split payment breakdown amounts for Cash, Card, UPI, or Credit');
          return;
        }
        if (displayGrandTotal > 0 && totalSplitEntered < displayGrandTotal && Math.abs(displayGrandTotal - totalSplitEntered) > 0.01) {
          const shortfall = (displayGrandTotal - totalSplitEntered).toFixed(2);
          setHardwareError(`Split payment total (₹${totalSplitEntered.toFixed(2)}) is less than Grand Total (₹${displayGrandTotal.toFixed(2)}). Remaining shortfall: ₹${shortfall}`);
          return;
        }
        // With a credit part the amounts must add up exactly: more would leave the customer's due ambiguous.
        if ((Number(splitDetails?.credit) || 0) > 0 && totalSplitEntered - displayGrandTotal > 0.01) {
          setHardwareError(`Split payment total (₹${totalSplitEntered.toFixed(2)}) is more than Grand Total (₹${displayGrandTotal.toFixed(2)}). Reduce the credit or payment amounts by ₹${(totalSplitEntered - displayGrandTotal).toFixed(2)}`);
          return;
        }
      }

      const isEditing = !!editingInvoiceId;

      const effectiveGrandTotal = displayGrandTotal;

      const effectiveFinalPaymentMethod = paymentMethod === 'SPLIT' ? 'SPLIT' : paymentMethod;
      const isPaymentPending = effectiveFinalPaymentMethod === 'PENDING';
      const defaultFullPaid = ['CASH', 'UPI', 'CARD', 'CHEQUE'].includes(effectiveFinalPaymentMethod) ? effectiveGrandTotal : 0;
      const effectiveReceivedAmount = isPaymentPending ? 0 : (effectiveFinalPaymentMethod === 'SPLIT' ? splitTotal : ((receivedAmount && receivedAmount > 0) ? receivedAmount : defaultFullPaid));
      const effectiveBalanceAmount = isPaymentPending || refundAmount > 0 ? 0 : Math.round((balanceAmount + effectiveReceivedAmount - receivedAmount) * 100) / 100;

      const invoice_id = isEditing ? editingInvoiceId : uuidv4();
      const series = enableThreeInvoiceSeries ? (invoiceType === 'GST' ? (isB2B ? 'gst_b2b' : 'gst_b2c') : 'normal') : (invoiceType === 'GST' ? 'gst' : undefined);
      let invoice_number: string;
      if (isEditing && editingInvoiceNumber) {
        invoice_number = editingInvoiceNumber;
      } else {
        const localPeek = await invoicesApi.peekNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
        const serverResult = await invoicesApi.getNextServerInvoiceNumber({ tenant_id: tenantId || 'global', series, start: localPeek?.counter });
        if (serverResult.success && serverResult.invoiceNumber) {
          invoice_number = serverResult.invoiceNumber;
        } else {
          const localResult = await invoicesApi.getNextInvoiceNumber({ tenant_id: tenantId || 'global', series });
          invoice_number = localResult.success && localResult.invoiceNumber
            ? localResult.invoiceNumber
            : `${terminalCodeState || 'POS1'}-${Date.now()}-${invoice_id.substring(0, 4).toUpperCase()}`;
        }
      }

      // Build line items for the invoice (regular items only — scrap items not in cart in normal mode)
      const regularCartItems = items.filter(item => !item.isScrap);
      // Determine supply type (intra vs inter-state) once for the whole invoice
      const _shopStateCart = useCartStore.getState().shopState || '';
      const _customerStateCart = customerState || '';
      const _supplyType = resolveSupplyType(invoiceType, _shopStateCart, _customerStateCart);

      const checkoutItems = buildCheckoutLines(regularCartItems, {
        invoiceType, supplyType: _supplyType, bosTaxRatePercent, bosTaxInclusive, pcsSnapshot,
      });

      // Build receipt display items
      const receiptItems = buildReceiptLines(regularCartItems, pcsSnapshot);

      const cfg = await getSetting<ReceiptPrinterConfig>({ tenant_id: tenantId || 'global', key: 'receipt_printer_config' });
      const width = cfg?.receiptWidthCm ? Number(cfg.receiptWidthCm) : 5.8;

      const printFmtRaw = await getSetting<PrintFormatSettings>({ tenant_id: tenantId || 'global', key: 'print_format' });
      const printFmt = parsePrintFormat(printFmtRaw);
      const openCashDrawerOnPending = printFmt.openCashDrawerOnPending === true;
      const isHalfA4 = printFmt.format === 'half-a4';
      const isA4 = printFmt.format === 'a4';
      const isGstOrB2B = invoiceType === 'GST' || isB2B;
      const useA4 = isGstOrB2B || isA4 || isHalfA4;
      const billSettings = { ...DEFAULT_BILL_SETTINGS, ...(printFmt.billSettings || {}) };

      const state = useCartStore.getState();
      // Calculate loyalty points
      const previousPointsBalance = loyaltyEnabled ? Number(loyaltyCustomerData.pointsBalance) || 0 : 0;
      const hasCustomerForPoints = Boolean(loyaltyCustomerData.customerId || (customerPhone && customerPhone.trim()));
      const shouldAwardPointsNow = paymentMethod !== 'PENDING' || loyaltyAwardOnPending;
      const pointsEarned = loyaltyEnabled && hasCustomerForPoints && shouldAwardPointsNow
        ? Math.floor(displayGrandTotal / (loyaltyEarningRate > 0 ? loyaltyEarningRate : 100))
        : 0;
      const pointsRedeemed = loyaltyEnabled && pointsToRedeem > 0
        ? Math.min(pointsToRedeem, Number(loyaltyCustomerData.pointsBalance) || 0)
        : 0;
      const pointsRedeemedDiscount = pointsRedeemed * loyaltyRedemptionRate;
      const remainingPointsBalance = previousPointsBalance + pointsEarned - pointsRedeemed;
      // Adjust grand total for points redemption discount (already calculated above as effectiveGrandTotal)

      // Pass grand total BEFORE scrap deduction so the receipt can properly show
      // the scrap deduction line and compute the correct final grand total.
      // Without this fix, scrap deduction was subtracted twice (here and in receiptGenerator).
      const grandTotalBeforeScrap = Math.max(0, (isGrandTotalOverridden ? (activeTab!.manualTotalOverride! + (storeScrapDeduction || 0) + (storeReturnDeduction || 0)) : grandTotal) - pointsRedeemedDiscount);

      const cleanCustName = (customerName || '').trim();
      const cleanCustPhone = (customerPhone || '').trim();
      const matchedParty = findMatchingParty(cleanCustName, cleanCustPhone);
      const currentPartyKey = `${cleanCustName.toLowerCase()}|${cleanCustPhone}`;
      const isStaffParty = String(matchedParty?.party_type || '').toUpperCase() === 'STAFF';
      const editingContribution = isEditing && !isStaffParty && activeTab?.editingInvoicePartyKey === currentPartyKey
        ? (Number(activeTab?.editingInvoiceContribution) || 0)
        : 0;
      const partyOldBalance = matchedParty ? (Number(matchedParty.balance) || 0) - editingContribution : 0;
      const splitCreditAmount = Number(splitDetails?.credit) || 0;
      const isSplitCreditBill = effectiveFinalPaymentMethod === 'SPLIT' && splitCreditAmount > 0;
      const splitNonCreditPaid = (Number(splitDetails?.cash) || 0)
        + (Number(splitDetails?.card) || 0)
        + (Number(splitDetails?.upi) || 0)
        + (Number(splitDetails?.cheque) || 0)
        + (Number(splitDetails?.bank_transfer) || 0);
      const newPartyContribution = effectiveFinalPaymentMethod === 'CREDIT'
        ? Math.max(0, effectiveGrandTotal - (effectiveReceivedAmount || 0))
        : isSplitCreditBill
        ? Math.max(0, effectiveGrandTotal - splitNonCreditPaid)
        : 0;
      const partyNewBalance = partyOldBalance + newPartyContribution;
      const tracksPartyBalance = partyOldBalance !== 0 || effectiveFinalPaymentMethod === 'CREDIT' || isSplitCreditBill;
      const splitDetailsForSave: SplitDetails = { ...(splitDetails || {}) };
      if (effectiveFinalPaymentMethod !== 'SPLIT') {
        splitDetailsForSave.cash = 0;
        splitDetailsForSave.card = 0;
        splitDetailsForSave.upi = 0;
        splitDetailsForSave.cheque = 0;
        splitDetailsForSave.bank_transfer = 0;
        if (effectiveFinalPaymentMethod !== 'CREDIT') splitDetailsForSave.credit = 0;
      }

      // ── Credit Limit & Credit Period Enforcement ──────────────────────────────
      // Determine how much of THIS bill is on credit
      let billCreditAmount = 0;
      if (effectiveFinalPaymentMethod === 'CREDIT') {
        billCreditAmount = Math.max(0, effectiveGrandTotal);
      } else if (effectiveFinalPaymentMethod === 'SPLIT') {
        billCreditAmount = Math.max(0, Number(splitDetails.credit) || 0);
      }

      // Check credit period expiry restriction (Cash purchases remain 100% available)
      if (billCreditAmount > 0 && matchedParty) {
        const creditPeriodEnabled = Boolean((matchedParty as B.DirectoryRecord).credit_period_enabled);
        const restrictOnExpiry = (matchedParty as B.DirectoryRecord).restrict_on_credit_expiry !== false && (matchedParty as B.DirectoryRecord).restrict_on_credit_expiry !== 0;
        const hasOverdue = Boolean((matchedParty as B.DirectoryRecord).has_overdue);

        if (creditPeriodEnabled && restrictOnExpiry && hasOverdue) {
          const overdueCount = (matchedParty as B.DirectoryRecord).overdue_bills_count || 1;
          const overdueAmt = (matchedParty as B.DirectoryRecord).overdue_amount ? ` (₹${Number((matchedParty as B.DirectoryRecord).overdue_amount).toFixed(2)})` : '';
          setHardwareError(
            `Credit purchases restricted for ${matchedParty.name}! Customer has ${overdueCount} overdue bill${overdueCount !== 1 ? 's' : ''}${overdueAmt} exceeding credit period. Please collect outstanding dues or switch to Cash/Card/UPI.`
          );
          return;
        }
      }

      // Block checkout if the party's credit balance would exceed their limit.
      if (matchedParty && Number(matchedParty.credit_limit) > 0 && newPartyContribution > 0) {
        const creditLimit = Number(matchedParty.credit_limit);
        const projectedBalance = partyOldBalance + newPartyContribution;
        if (projectedBalance > creditLimit) {
          const excess = projectedBalance - creditLimit;
          const fmtNum = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setHardwareError(
            `Credit Limit Exceeded for ${matchedParty.name}! Limit: ₹${fmtNum(creditLimit)}, Current Due: ₹${fmtNum(partyOldBalance)}, Bill Credit: ₹${fmtNum(newPartyContribution)}. Exceeds limit by ₹${fmtNum(excess)} — Cannot complete bill.`
          );
          return;
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const receiptData: ReceiptData = {
        shopName: (invoiceType === 'GST' || billSettings.showShopName !== false) ? (shopNameState || shopName || 'My Shop') : '',
        shopGstin: (invoiceType === 'GST' || billSettings.showShopGstin !== false) ? (shopGstin || undefined) : undefined,
        shopState: (invoiceType === 'GST' || billSettings.showShopState !== false) ? (state.shopState || undefined) : undefined,
        shopAddress: (invoiceType === 'GST' || billSettings.showShopAddress !== false) ? (shopAddress || undefined) : undefined,
        shopPhone: (invoiceType === 'GST' || billSettings.showPhone !== false) ? (shopPhone || undefined) : undefined,
        shopEmail: shopEmail || undefined,
        shopWebsite: shopWebsite || undefined,
        bankName: bankNameState || undefined,
        bankAccount: bankAccountState || undefined,
        bankIfsc: bankIfscState || undefined,
        bankBranch: bankBranchState || undefined,
        upiId: upiId || undefined,
        showUpiQr: showUpiQr,
        showProductOffers: printFmt?.showProductOffers !== undefined ? Boolean(printFmt.showProductOffers) : true,
        showPriceOverrideMrp: printFmt?.showPriceOverrideMrp !== undefined ? Boolean(printFmt.showPriceOverrideMrp) : true,
        invoiceNumber: invoice_number, date: formatBillDateTime(new Date()),
        billerName: useAuthStore.getState().userName || useAuthStore.getState().role || undefined,
        items: receiptItems,
        subtotal, tax: totalTax,
        cgst: invoiceType === 'GST' ? cgst : (billSettings.showBosTaxBreakup ? cgst : undefined),
        sgst: invoiceType === 'GST' ? sgst : (billSettings.showBosTaxBreakup ? sgst : undefined),
        igst: invoiceType === 'GST' ? igst : (billSettings.showBosTaxBreakup ? igst : undefined),
        discount, discountType: state.discountType,
        discountValue: state.discountValue, grandTotal: grandTotalBeforeScrap,
        pointsEarned: pointsEarned > 0 ? pointsEarned : undefined,
        previousPointsBalance: previousPointsBalance > 0 ? previousPointsBalance : undefined,
        pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
        pointsRedeemedDiscount: pointsRedeemedDiscount > 0 ? pointsRedeemedDiscount : undefined,
        remainingPointsBalance: remainingPointsBalance > 0 ? remainingPointsBalance : undefined,
        scrapDeduction: storeScrapDeduction || undefined, scrapInvoiceNumber: storeScrapInvoiceNumber || undefined,
        returnDeduction: storeReturnDeduction || undefined, returnInvoiceNumber: storeReturnInvoiceNumber || undefined,
        ...(effectiveFinalPaymentMethod === 'CREDIT'
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveReceivedAmount,
              balanceAmount: partyNewBalance,
              customerBalance: partyNewBalance,
              paymentMethod: 'CREDIT',
            }
          : (effectiveFinalPaymentMethod === 'CASH' && !isPaymentPending)
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveReceivedAmount,
              balanceAmount: partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount,
              customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
              paymentMethod: 'CASH',
            }
          : isSplitCreditBill
          ? {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              receivedAmount: effectiveGrandTotal - splitCreditAmount,
              balanceAmount: partyNewBalance,
              customerBalance: partyNewBalance,
              paymentMethod: 'SPLIT',
            }
          : {
              oldBalance: partyOldBalance !== 0 ? partyOldBalance : undefined,
              customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
              ...(effectiveFinalPaymentMethod === 'SPLIT' ? { receivedAmount: effectiveReceivedAmount } : {}),
              paymentMethod: effectiveFinalPaymentMethod,
            }
        ),
        invoiceType,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerAddress: customerAddress || undefined,
        customerGstin: customerGstin?.trim() || undefined,
        transporterName: activeTab?.transporterName || undefined,
        vehicleNumber: activeTab?.vehicleNumber || undefined,
        transporterDocNo: activeTab?.transporterDocNo || undefined,
        transporterDocDate: activeTab?.transporterDocDate || undefined,
        ewayBillNo: activeTab?.ewayBillNo || undefined,
        ewayBillDate: activeTab?.ewayBillDate || undefined,
        shippingName: activeTab?.shippingName || undefined,
        shippingAddress: activeTab?.shippingAddress || undefined,
        shippingGstin: activeTab?.shippingGstin || undefined,
        customerState: customerState || undefined,
        description: activeTab?.description || undefined,
        notes: activeTab?.description || undefined,
        billSettings,
        isB2B,
        a5Orientation: printFmt.a5Orientation || 'horizontal',
        ...(billCreditAmount > 0 && matchedParty && (matchedParty as B.DirectoryRecord).credit_period_enabled ? {
          dueDate: (() => {
            const days = Number((matchedParty as B.DirectoryRecord).credit_period_days) || 30;
            const d = new Date();
            d.setDate(d.getDate() + days);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          })(),
          creditPeriodDays: Number((matchedParty as B.DirectoryRecord).credit_period_days) || 30,
        } : {}),
      };

      let result: B.CheckoutResult;
      const wantsLoyalty = loyaltyEnabled && !!(customerName || '').trim() && (!!(customerPhone || '').trim() || !!(customerAddress || '').trim() || loyaltyCustomerData.customerId);
      if (isEditing) {
        result = await invoicesApi.updateInvoice({
          invoice_id, tenant_id: tenantId || 'global', role: editingInvoiceRole || authRole,
          permissions: useAuthStore.getState().permissions || [],
          user_id: userId || undefined,
          created_at: activeTab?.billDate || undefined,
          subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: effectiveFinalPaymentMethod,
          received_amount: effectiveReceivedAmount,
          balance_amount: effectiveFinalPaymentMethod === 'CREDIT'
            ? partyNewBalance
            : isSplitCreditBill
            ? partyNewBalance
            : (partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount),
          split_details: {
            ...splitDetailsForSave,
            ...(currentSelectedUpi ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id } : {}),
            ...(partyOldBalance !== 0 ? { old_due: partyOldBalance, old_balance: partyOldBalance } : {}),
            ...(tracksPartyBalance ? { new_due: partyNewBalance } : {})
          },
          customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          is_staff: Boolean(activeTab?.isStaffCustomer),
          staff_id: activeTab?.staffId || (activeTab?.isStaffCustomer ? activeTab.customerId : null),
          customer_gstin: (invoiceType === 'GST' || billSettings.showCustomerGstin !== false) ? (customerGstin || null) : null,
          customer_state: (invoiceType === 'GST' || billSettings.showCustomerState !== false) ? (customerState || null) : null,
          customer_address: customerAddress || null,
          description: activeTab?.description || null,
          notes: activeTab?.description || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          actual_refund_paid: refundAmount > 0 && paymentMethod !== 'PENDING'
            ? (actualRefundPaid > 0 ? actualRefundPaid : refundAmount)
            : 0,
          // GST totals for edited invoice
          cgst_total: cgst, sgst_total: sgst, igst_total: igst, supply_type: _supplyType,
          items: checkoutItems,
          loyalty_enabled: wantsLoyalty,
          loyalty_customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          points_earned: pointsEarned,
          points_redeemed: pointsRedeemed,
          points_redeemed_discount: pointsRedeemedDiscount,
          previous_points_balance: previousPointsBalance,
          remaining_points_balance: remainingPointsBalance,
        });
      } else {
        result = await invoicesApi.checkout({
          bill_purpose: useCartStore.getState().isFilingOnly ? 'FILING_ONLY' : 'SALE',
          invoice_id, tenant_id: tenantId || 'unset', user_id: userId || 'unset',
          biller_staff_id: useCartStore.getState().billerStaffId || null,
          sales_staff_id: useCartStore.getState().salesStaffId || null,
          created_at: activeTab?.billDate || undefined,
          invoice_number,
          invoice_type: invoiceType, subtotal, tax_total: totalTax, discount_total: discount,
          discount_type: useCartStore.getState().discountType, discount_value: useCartStore.getState().discountValue,
          grand_total: effectiveGrandTotal, payment_method: effectiveFinalPaymentMethod,
          split_details: {
            ...splitDetailsForSave,
            ...(currentSelectedUpi ? { upi_id: currentSelectedUpi.upi_id, upi_name: currentSelectedUpi.name, upi_source_id: currentSelectedUpi.source_id } : {}),
            ...(partyOldBalance !== 0 ? { old_due: partyOldBalance, old_balance: partyOldBalance } : {}),
            ...(tracksPartyBalance ? { new_due: partyNewBalance } : {})
          },
          received_amount: effectiveReceivedAmount,
          balance_amount: effectiveFinalPaymentMethod === 'CREDIT'
            ? partyNewBalance
            : isSplitCreditBill
            ? partyNewBalance
            : (partyOldBalance !== 0 ? partyNewBalance : effectiveBalanceAmount),
          customer_id: activeTab?.customerId || loyaltyCustomerData.customerId || null,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          is_staff: Boolean(activeTab?.isStaffCustomer),
          staff_id: activeTab?.staffId || (activeTab?.isStaffCustomer ? activeTab.customerId : null),
          customer_gstin: (invoiceType === 'GST' || billSettings.showCustomerGstin !== false) ? (customerGstin || null) : null,
          customer_state: (invoiceType === 'GST' || billSettings.showCustomerState !== false) ? (customerState || null) : null,
          customer_address: customerAddress || null,
          description: activeTab?.description || null,
          notes: activeTab?.description || null,
          scrap_deduction: storeScrapDeduction || 0, scrap_invoice_number: storeScrapInvoiceNumber || null,
          return_deduction: storeReturnDeduction || 0, return_invoice_number: storeReturnInvoiceNumber || null,
          actual_refund_paid: refundAmount > 0 && paymentMethod !== 'PENDING'
            ? (actualRefundPaid > 0 ? actualRefundPaid : refundAmount)
            : 0,
          // GST invoice-level totals (Indian GST Act compliance)
          cgst_total: cgst, sgst_total: sgst, igst_total: igst, supply_type: _supplyType,
          items: checkoutItems,
          scrap_items: [],
          loyalty_enabled: wantsLoyalty,
          loyalty_customer_id: loyaltyCustomerData.customerId,
          points_earned: pointsEarned,
          points_redeemed: pointsRedeemed,
          points_redeemed_discount: pointsRedeemedDiscount,
          previous_points_balance: previousPointsBalance,
          remaining_points_balance: remainingPointsBalance,
        });
      }
      if (!result.success) {
        setHardwareError(isEditing ? `Update failed: ${result.error || 'Unknown error'}` : `Checkout failed: ${result.error || 'Unknown error'}`);
        return;
      }

      // Ensure receipt printing and activeTab title use the exact confirmed invoice_number returned by DB/checkout
      const confirmedInvoiceNumber = (result && result.invoice_number) ? result.invoice_number : invoice_number;
      invoice_number = confirmedInvoiceNumber;
      receiptData.invoiceNumber = confirmedInvoiceNumber;
      if (result && result.created_at) {
        receiptData.date = formatBillDateTime(result.created_at);
      }

      // Consume ADJUST_BILL return credit. Only the portion actually applied to this
      // bill (clamped to the bill total) is settled; any leftover stays as pending
      // credit for a future bill. Editing a bill never re-consumes credit.
      if (!isEditing && storeReturnDeduction > 0 && storeReturnInvoiceNumber && isDesktopRuntime()) {
        try {
          const consumed = Math.min(storeReturnDeduction, returnConsumed > 0 ? returnConsumed : grandTotal);
          await returnsApi.settleReturnInvoice({
            tenant_id: tenantId || 'global',
            return_number: storeReturnInvoiceNumber,
            adjusted_invoice_number: invoice_number,
            amount: consumed,
          });
        } catch (e) {
          console.error('Failed to settle ADJUST_BILL return credit:', e);
        }
      }

      // Auto-record cash out if there was a leftover refund amount and payment method is CASH.
      // refundAmount only covers SCRAP credit excess — ADJUST_BILL leftover stays as credit.
      if (refundAmount > 0 && paymentMethod === 'CASH' && isDesktopRuntime()) {
        try {
          await cashierApi.addTransaction({
            tenant_id: tenantId || 'global',
            type: 'CASH_OUT',
            amount: refundAmount,
            category: 'CREDIT_REFUND',
            notes: `Refund leftover credits for invoice ${invoice_number}`,
            user_id: userId,
            user_name: useAuthStore.getState().userName || undefined
          });
        } catch (e) {
          console.error('Failed to log auto cash-out for scrap refund:', e);
        }
      }

      // Update tab title to reflect the completed invoice number
      updateActiveTab({ title: invoice_number });

      // If this was a quotation being billed, mark it as CONVERTED
      if (editingQuotationId) {
        try {
          await quotationsApi.updateQuotationStatus({
            quotation_id: editingQuotationId,
            status: 'CONVERTED',
            converted_to_invoice: 1,
            invoice_id,
          });
        } catch (e) {
          console.error('Failed to update quotation status', e);
        }
      }

      // ── Print receipt AFTER successful save (non-fatal) ──
      printSuccess = true;
      if (!saveOnly) {
        try {
          if (useA4) {
            const invoiceStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
            const invoiceHtml = generateInvoiceHtml(receiptData, invoiceStyle as B.InvoiceStyle);
            const printResult = await printingApi.printA4Html(tenantId || 'global', invoiceHtml);
            if (!printResult.success) {
              printSuccess = false;
              if ((printResult as { useDefaultDialog?: boolean }).useDefaultDialog) {
                const pw = window.open('', '_blank');
                if (pw) { pw.document.write(invoiceHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
              } else {
                setHardwareError(formatPrinterError(printResult.error));
                setTimeout(() => setHardwareError(null), 5000);
              }
            }
          } else {
            const thermalWidth = printFmt.width ? Number(printFmt.width) / 10 : width;
            const thermalStyle = printFmt.thermalStyle || (printFmt.format === 'thermal' ? printFmt.style : undefined) || 'standard';
            const receiptText = generateReceiptText(receiptData, thermalWidth, undefined, thermalStyle);
            const printResult = await printingApi.printReceipt(tenantId || 'global', receiptText);
            if (!printResult.success) {
              printSuccess = false;
              console.warn('[Checkout] Print failed (invoice saved):', printResult.error);
              setHardwareError(formatPrinterError(printResult.error));
              setTimeout(() => setHardwareError(null), 5000);
            } else if (printResult.skipped) {
              printSuccess = false;
              setHardwareError(formatPrinterError('No printer configured'));
              setTimeout(() => setHardwareError(null), 5000);
            }
          }
          if (!isPaymentPending || openCashDrawerOnPending) {
            printingApi.openCashDrawer(tenantId || 'global').catch(() => {});
          }
        } catch (printErr) {
          printSuccess = false;
          console.warn('[Checkout] Print error (invoice already saved):', printErr);
          setHardwareError(formatPrinterError((printErr as Error).message));
          setTimeout(() => setHardwareError(null), 5000);
        }
      }

      setCheckoutSuccess(saveOnly || !printSuccess ? 'saved' : 'printed');

      // ── Send Bill via WhatsApp (Automatic if enabled & phone present) ──
      const isAutoWhatsApp = localStorage.getItem('auto_whatsapp_send') === 'true';
      const custPhone = (customerPhone || activeTab?.customerPhone || '').trim();
      if (isAutoWhatsApp && custPhone && hasBridge('whatsappSendInvoice')) {
        try {
          const invStyle = (!isGstOrB2B && isHalfA4) ? 'half-a4' : (printFmt.a4Style || (printFmt.format === 'a4' ? printFmt.style : undefined) || 'boxed');
          const fullHtml = generateInvoiceHtml(receiptData, invStyle as B.InvoiceStyle);
          const waMessage = formatWhatsAppBillMessage({
            shopName: receiptData.shopName || shopName || 'Store',
            invoiceNumber: confirmedInvoiceNumber,
            date: receiptData.date || new Date().toLocaleDateString('en-IN'),
            customerName: customerName || undefined,
            customerPhone: custPhone,
            items: (receiptItems || []).map((i) => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: Number(i.unit_price) || 0,
              total: Number(i.total) || 0
            })),
            grandTotal: effectiveGrandTotal,
            receivedAmount: effectiveReceivedAmount,
            balanceAmount: tracksPartyBalance ? partyNewBalance : effectiveBalanceAmount,
            paymentMethod: effectiveFinalPaymentMethod,
            dueDate: (receiptData as typeof receiptData & { dueDate?: string; creditPeriodDays?: number }).dueDate,
            creditPeriodDays: (receiptData as typeof receiptData & { dueDate?: string; creditPeriodDays?: number }).creditPeriodDays,
            customerBalance: partyOldBalance !== 0 ? partyNewBalance : undefined,
          });

          sendConfiguredBill(tenantId || 'global', {
            phone: custPhone, message: waMessage, legacyHtml: fullHtml,
            a4Html: generateInvoiceHtml(receiptData, (printFmt.a4Style || 'boxed') as B.InvoiceStyle),
            receiptText: generateReceiptText(receiptData, printFmt.width ? Number(printFmt.width) / 10 : width, undefined, printFmt.thermalStyle || 'standard'),
            invoiceNumber: confirmedInvoiceNumber, receiptWidthMm: Number(printFmt.width) || 80,
          }).then(result => { if (!result.success) console.warn('[WhatsApp Auto Send Error]:', result.error); }).catch((err) => console.warn('[WhatsApp Auto Send Error]:', err));
        } catch (e) {
          console.warn('[WhatsApp Build Error]:', e);
        }
      }

      // Notify the cashier settlement page (if open) to refresh instantly
      try {
        window.dispatchEvent(new CustomEvent('checkout:completed', { detail: { invoice_id: invoice_id || '', invoice_number: invoice_number || '' } }));
      } catch { /* ignore */ }
      // Refresh parties list so party balances update immediately
      listParties(tenantId || 'global')
        .then((res) => {
          if (Array.isArray(res)) setPartiesForTier(res);
        })
        .catch(console.error);
      setTimeout(async () => {
        const tabsCount = useTabStore.getState().tabs.length;
        const targetTabId = checkoutTabId;
        if (invoiceType === 'GST') {
          setInvoiceType('BILL_OF_SUPPLY');
        }
        if (tabsCount > 1) {
          closeTab(targetTabId);
        } else {
          clearCart();
          clearScrapDeduction();
          clearReturnDeduction();
          setLoyaltyCustomerData({ customerId: '', pointsBalance: 0 });
          setShowLoyaltyRedemption(false);
          setPointsToRedeem(0);
          updateActiveTab({ customerName: '', customerPhone: '', customerGstin: '', customerAddress: '', customerId: '', manualTotalOverride: null, editingInvoiceContribution: 0, editingInvoicePartyKey: '', billDate: null, paymentMethod: isCashSettlementEnabled ? 'PENDING' : 'CASH', receivedAmount: 0, actualRefundPaid: 0, reservedInvoiceNumber: '', reservedScrapInvoiceNumber: '', reservedQuotationNumber: '', reservedReturnNumber: '' });
          syncActiveSnapshot();
          await reserveInvoiceNumberForTab();
          const tab = getActiveTab();
          if (tab?.reservedInvoiceNumber) {
            updateActiveTab({ title: tab.reservedInvoiceNumber });
          }
        }
        setCheckoutSuccess(false); // normal mode reset
      }, 1800);
    } catch (err) {
      console.error('[Checkout Error]', err);
      setHardwareError(`Checkout failed: ${(err as Error)?.message || 'Unexpected error'}`);
    } finally {
      isCheckingOutRef.current = false;
      setIsCheckingOut(false);
    }
  };
}
