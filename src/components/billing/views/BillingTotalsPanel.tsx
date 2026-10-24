import React from 'react';
import type { DeductionState } from './DeductionEditor';
import clsx from 'clsx';
import { Gift, X } from 'lucide-react';
import { useCartStore } from '../../../store/cartStore';
import { useTabStore } from '../../../store/tabStore';
import { formatCurrency } from '../BillingConstants';
import type { BillingUIConfig } from '../../../store/billingUIStore';
import { DeductionEditor } from './DeductionEditor';
import { TotalsActionButtons } from './totals/TotalsActionButtons';
import { GrandTotalSection } from './totals/GrandTotalSection';
import { DiscountRow } from './totals/DiscountRow';

export interface BillingTotalsPanelProps {
  uiConfig: BillingUIConfig;
  activeDiscField: any;
  activeTab: any;
  actualRefundPaid: number;
  cgst: number;
  checkoutBtnRef: React.MutableRefObject<any>;
  commitTotalOverride: any;
  customerName: any;
  customerPhone: any;
  descriptionInputRef: React.MutableRefObject<any>;
  discount: number;
  discountPercentRef: React.MutableRefObject<any>;
  discountRef: React.MutableRefObject<any>;
  displayGrandTotal: number;
  enableScrap: boolean;
  extraBonus: number;
  findMatchingParty: any;
  focusDescriptionOrDiscount: any;
  grandTotal: number;
  handleCheckout: any;
  handleHoldBill: any;
  handleProcessReturnFromCart: any;
  handleResetGrandTotalOverride: any;
  handleSaveQuotation: any;
  handleWhatsAppSendActiveBill: any;
  igst: number;
  isCheckingOut: boolean;
  isEditingTotal: boolean;
  isGrandTotalOverridden: boolean;
  isLoadingEditBill: boolean;
  isQuotationActive: boolean;
  isSendingWhatsApp: boolean;
  localDiscText: any;
  originalReturnTotal: number;
  overrideTotalInput: any;
  paymentMethod: any;
  paymentOptionRefs: any;
  qtyRefs: any;
  quotationSaving: boolean;
  rawDisplayGrandTotal: number;
  receivedAmount: number;
  receivedInputRef: React.MutableRefObject<any>;
  refundAmount: number;
  returnDiscountTotal: number;
  returnProcessed: boolean;
  returnProcessing: boolean;
  returnTotal: number;
  scrapTotal: number;
  searchRef: React.MutableRefObject<any>;
  setActiveDiscField: (v: any) => void;
  setIsEditingTotal: (v: any) => void;
  setLocalDiscText: (v: any) => void;
  setOverrideTotalInput: (v: any) => void;
  setShowLoyaltyRedemption: (v: any) => void;
  sgst: number;
  showDescriptionState: boolean;
  splitDetails: any;
  splitTotal: number;
  startEditingTotal: any;
  subtotal: number;
  totalKgs: number;
  totalOverrideInputRef: React.MutableRefObject<any>;
  totalPcs: number;
  totalProducts: number;
  totalTax: number;
  deductions: DeductionState;
}

export const BillingTotalsPanel: React.FC<BillingTotalsPanelProps> = ({
  uiConfig,
  activeDiscField,
  activeTab,
  actualRefundPaid,
  cgst,
  checkoutBtnRef,
  commitTotalOverride,
  customerName,
  customerPhone,
  descriptionInputRef,
  discount,
  discountPercentRef,
  discountRef,
  displayGrandTotal,
  enableScrap,
  extraBonus,
  findMatchingParty,
  focusDescriptionOrDiscount,
  grandTotal,
  handleCheckout,
  handleHoldBill,
  handleProcessReturnFromCart,
  handleResetGrandTotalOverride,
  handleSaveQuotation,
  handleWhatsAppSendActiveBill,
  igst,
  isCheckingOut,
  isEditingTotal,
  isGrandTotalOverridden,
  isLoadingEditBill,
  isQuotationActive,
  isSendingWhatsApp,
  localDiscText,
  originalReturnTotal,
  overrideTotalInput,
  paymentMethod,
  paymentOptionRefs,
  qtyRefs,
  quotationSaving,
  rawDisplayGrandTotal,
  receivedAmount,
  receivedInputRef,
  refundAmount,
  returnDiscountTotal,
  returnProcessed,
  returnProcessing,
  returnTotal,
  scrapTotal,
  searchRef,
  setActiveDiscField,
  setIsEditingTotal,
  setLocalDiscText,
  setOverrideTotalInput,
  setShowLoyaltyRedemption,
  sgst,
  showDescriptionState,
  splitDetails,
  splitTotal,
  startEditingTotal,
  subtotal,
  totalKgs,
  totalOverrideInputRef,
  totalPcs,
  totalProducts,
  totalTax,
  deductions,
}) => {
  const { pointsRedeemedCalc, pointsRedeemedDiscountCalc, setPointsToRedeem } = deductions;
  const items = useCartStore(s => s.items);
  const discountType = useCartStore(s => s.discountType);
  const discountValue = useCartStore(s => s.discountValue);
  const editingActive = useCartStore(s => s.editingInvoiceId);
  const editingQuotationId = useCartStore(s => s.editingQuotationId);
  const invoiceType = useCartStore(s => s.invoiceType);
  const isQuotationMode = useCartStore(s => s.isQuotationMode);
  const isReturnMode = useCartStore(s => s.isReturnMode);
  const isScrapMode = useCartStore(s => s.isScrapMode);
  const setDiscount = useCartStore(s => s.setDiscount);
  const storeReturnDeduction = useCartStore(s => s.returnDeduction);
  const storeScrapDeduction = useCartStore(s => s.scrapDeduction);
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  return (
      <div className={clsx(
        uiConfig.orientation === 'horizontal-stack'
          ? "w-1/2 h-full overflow-y-auto flex flex-col justify-between bg-card px-5 py-3 shrink-0 border-l border-border"
          : "shrink-0 border-t border-border bg-background"
      )}>

        {/* Calculation breakdown */}
        <div className="px-5 pt-2.5 pb-0 space-y-1.5 text-xs border-b border-border">
          <div className="flex justify-between items-center pb-1 border-b border-border/40 text-muted-foreground transition-all duration-300">
            <span className="font-bold text-xs text-muted-foreground">Items Summary</span>
            <span className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
              <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalProducts} {totalProducts === 1 ? 'Product' : 'Products'}</span>
              <span className={clsx(items.length === 0 && 'text-muted-foreground/40')}>&middot;</span>
              <span className={clsx(items.length === 0 && 'text-muted-foreground/60')}>{totalPcs} Pcs</span>
              {totalKgs > 0 && (
                <>
                  <span>&middot;</span>
                  <span className="text-amber-600 dark:text-amber-400">{totalKgs.toFixed(3)} Kg</span>
                </>
              )}
            </span>
          </div>

          {isReturnMode && returnDiscountTotal > 0.005 ? (
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Original Items Total</span>
                <span className="font-semibold text-muted-foreground line-through font-mono">{formatCurrency(originalReturnTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Invoice Discount Deducted</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">-{formatCurrency(returnDiscountTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold text-sm">Net Return Subtotal</span>
                <span className="font-bold text-foreground text-sm font-mono">{formatCurrency(returnTotal)}</span>
              </div>
            </>
          ) : (!isScrapMode ? subtotal > 0 : scrapTotal > 0) && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold text-sm">Items Subtotal</span>
              <span className="font-bold text-foreground text-sm">{formatCurrency(isScrapMode ? scrapTotal : subtotal)}</span>
            </div>
          )}

          {invoiceType === 'GST' && totalTax > 0 && (
            <>
              {igst > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">IGST (Out of State)</span>
                  <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">CGST</span>
                    <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(cgst)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">SGST</span>
                    <span className="font-semibold text-foreground/80 text-sm">{formatCurrency(sgst)}</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Discount row / Extra Bonus — hidden in return mode */}
          <DiscountRow
            activeDiscField={activeDiscField} activeTab={activeTab} descriptionInputRef={descriptionInputRef}
            discount={discount} discountPercentRef={discountPercentRef} discountRef={discountRef}
            discountType={discountType} discountValue={discountValue} extraBonus={extraBonus}
            handleCheckout={handleCheckout} isReturnMode={isReturnMode} isScrapMode={isScrapMode} items={items}
            localDiscText={localDiscText} paymentMethod={paymentMethod} paymentOptionRefs={paymentOptionRefs}
            qtyRefs={qtyRefs} receivedInputRef={receivedInputRef} scrapTotal={scrapTotal} searchRef={searchRef}
            setActiveDiscField={setActiveDiscField} setDiscount={setDiscount} setLocalDiscText={setLocalDiscText}
            showDescriptionState={showDescriptionState} subtotal={subtotal} updateActiveTab={updateActiveTab}
          />



        {/* ── Adjustment Block (Normal Mode Only): combined scrap + return deduction ── */}
        {uiConfig.orientation !== 'horizontal-stack' && (
        <DeductionEditor deductions={deductions} />
        )}

        {/* Scrap items row — shown in scrap mode with scrap cart items */}
        <div className={clsx(
          'overflow-hidden transition-all duration-300 ease-in-out',
          scrapTotal > 0 && isScrapMode && !isQuotationMode && enableScrap
            ? 'max-h-[80px] opacity-100'
            : 'max-h-0 opacity-0'
        )}>
          <div className="flex justify-between items-center pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-orange-600">Scrap Items</span>
              {Object.values(
                items.filter(i => i.isScrap).reduce((acc, s) => {
                  const key = s.scrap_category_id || '';
                  if (!acc[key]) acc[key] = { name: s.name, quantity: 0 };
                  acc[key].quantity += Number(s.quantity || 0);
                  return acc;
                }, {} as Record<string, { name: string; quantity: number }>)
              ).map(s => (
                <span key={s.name} className="text-[10px] text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full ml-1">
                  {s.name} {s.quantity.toFixed(3)}Kg
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded-full">
                {formatCurrency(scrapTotal)}
              </span>
            </div>
          </div>
        </div>

        </div>

        {/* Loyalty Redemption Discount in Totals */}
        {pointsRedeemedDiscountCalc > 0 && (
          <div className="mx-3 mb-1 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Gift className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 truncate">
                Loyalty Discount ({pointsRedeemedCalc} pts)
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                -{formatCurrency(pointsRedeemedDiscountCalc)}
              </span>
              <button
                onClick={() => { setPointsToRedeem(0); setShowLoyaltyRedemption(false); }}
                title="Remove Loyalty Discount"
                className="p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Grand Total + Received + Change */}
        <GrandTotalSection
          activeTab={activeTab} actualRefundPaid={actualRefundPaid} commitTotalOverride={commitTotalOverride}
          customerName={customerName} customerPhone={customerPhone} discount={discount}
          displayGrandTotal={displayGrandTotal} editingActive={editingActive} editingQuotationId={editingQuotationId}
          findMatchingParty={findMatchingParty} focusDescriptionOrDiscount={focusDescriptionOrDiscount}
          grandTotal={grandTotal} handleResetGrandTotalOverride={handleResetGrandTotalOverride}
          isEditingTotal={isEditingTotal} isGrandTotalOverridden={isGrandTotalOverridden}
          isLoadingEditBill={isLoadingEditBill} isQuotationMode={isQuotationMode} isReturnMode={isReturnMode}
          isScrapMode={isScrapMode} overrideTotalInput={overrideTotalInput} paymentMethod={paymentMethod}
          paymentOptionRefs={paymentOptionRefs} rawDisplayGrandTotal={rawDisplayGrandTotal}
          receivedAmount={receivedAmount} receivedInputRef={receivedInputRef} refundAmount={refundAmount}
          setIsEditingTotal={setIsEditingTotal} setOverrideTotalInput={setOverrideTotalInput}
          splitDetails={splitDetails} splitTotal={splitTotal} startEditingTotal={startEditingTotal}
          storeReturnDeduction={storeReturnDeduction} storeScrapDeduction={storeScrapDeduction}
          totalOverrideInputRef={totalOverrideInputRef} updateActiveTab={updateActiveTab}
        />



        {/* Action buttons (Dynamic responsive scaling based on desktop screen size) */}
        <TotalsActionButtons
          checkoutBtnRef={checkoutBtnRef} editingActive={editingActive} editingQuotationId={editingQuotationId}
          handleCheckout={handleCheckout} handleHoldBill={handleHoldBill}
          handleProcessReturnFromCart={handleProcessReturnFromCart} handleSaveQuotation={handleSaveQuotation}
          handleWhatsAppSendActiveBill={handleWhatsAppSendActiveBill} isCheckingOut={isCheckingOut}
          isQuotationActive={isQuotationActive} isReturnMode={isReturnMode} isScrapMode={isScrapMode}
          isSendingWhatsApp={isSendingWhatsApp} items={items} quotationSaving={quotationSaving}
          returnProcessed={returnProcessed} returnProcessing={returnProcessing}
        />

      </div>
  );
};
