import type * as B from '../billingTypes';
import React from 'react';
import clsx from 'clsx';
import { TrendingUp } from 'lucide-react';
import { BillingCartView } from './BillingCartView';
import { BillingCustomerDetails } from './BillingCustomerDetails';
import { reserveGstSeriesNumber } from '../numberReservation';
import { BillingPaymentPanel } from './BillingPaymentPanel';
import { BillingTotalsPanel } from './BillingTotalsPanel';
import type { Tab } from '../../../store/tabStore';
import type { CartItem } from '../../../store/cartStore';
import type { BillingCartViewProps } from './BillingCartView';
import type { BillingTotalsPanelProps } from './BillingTotalsPanel';
import type { BillingPaymentPanelProps } from './BillingPaymentPanel';
import type { useSearchSelection } from '../hooks/useSearchSelection';
import type { MostSoldProductRow } from '../productSearch';
import type { BillingCustomerDetailsProps } from './BillingCustomerDetails';

export interface BillingWorkspaceProps {
  activeCartProductIdRef: React.RefObject<string | null>;
  activeDiscField: BillingTotalsPanelProps['activeDiscField'];
  activeTab: BillingCustomerDetailsProps['activeTab'];
  actualRefundPaid: BillingTotalsPanelProps['actualRefundPaid'];
  canOverrideTier: BillingCustomerDetailsProps['canOverrideTier'];
  cgst: BillingTotalsPanelProps['cgst'];
  checkoutBtnRef: BillingTotalsPanelProps['checkoutBtnRef'];
  commitTotalOverride: BillingTotalsPanelProps['commitTotalOverride'];
  currentSelectedUpi: BillingPaymentPanelProps['currentSelectedUpi'];
  customerAddress: BillingCustomerDetailsProps['customerAddress'];
  customerFields: BillingCustomerDetailsProps['customerFields'];
  customerGstin: BillingCustomerDetailsProps['customerGstin'];
  customerHandlers: BillingCustomerDetailsProps['customerHandlers'];
  customerName: BillingCustomerDetailsProps['customerName'];
  customerPhone: BillingCustomerDetailsProps['customerPhone'];
  customerState: BillingCustomerDetailsProps['customerState'];
  deductions: BillingPaymentPanelProps['deductions'];
  descriptionInputRef: BillingPaymentPanelProps['descriptionInputRef'];
  discFlatRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  discount: BillingTotalsPanelProps['discount'];
  discountPercentRef: BillingTotalsPanelProps['discountPercentRef'];
  discountRef: BillingPaymentPanelProps['discountRef'];
  discRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  displayGrandTotal: BillingCustomerDetailsProps['displayGrandTotal'];
  editingActive: BillingCustomerDetailsProps['editingActive'];
  enableScrap: BillingTotalsPanelProps['enableScrap'];
  enableThreeInvoiceSeries: BillingCustomerDetailsProps['enableThreeInvoiceSeries'];
  extraBonus: BillingTotalsPanelProps['extraBonus'];
  fillRestForField: BillingPaymentPanelProps['fillRestForField'];
  filteredCustomerSuggestions: BillingCustomerDetailsProps['filteredCustomerSuggestions'];
  findMatchingParty: BillingCustomerDetailsProps['findMatchingParty'];
  focusDescriptionOrDiscount: BillingPaymentPanelProps['focusDescriptionOrDiscount'];
  focusNextCartField: (currentField: string, productId: string) => void;
  focusPrevCartField: (currentField: string, productId: string) => void;
  getActiveTab: () => Tab | undefined;
  grandTotal: BillingTotalsPanelProps['grandTotal'];
  guardScannerInput: (e: React.KeyboardEvent, productId: string, currentValue: number | string, restore: (v: number | string) => void) => void;
  handleCheckout: BillingTotalsPanelProps['handleCheckout'];
  handleDiscFlatKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleDiscKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleEditProduct: (item: CartItem) => Promise<void>;
  handleHoldBill: BillingTotalsPanelProps['handleHoldBill'];
  handleInvoiceTypeChange: BillingCustomerDetailsProps['handleInvoiceTypeChange'];
  handlePcsKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handlePricingTierChange: BillingCustomerDetailsProps['handlePricingTierChange'];
  handleProcessReturnFromCart: BillingTotalsPanelProps['handleProcessReturnFromCart'];
  handleQtyKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleRateUpDown: (productId: string, direction: "up" | "down") => void;
  handleResetGrandTotalOverride: BillingTotalsPanelProps['handleResetGrandTotalOverride'];
  handleSaveQuotation: BillingTotalsPanelProps['handleSaveQuotation'];
  handleSelectProduct: ReturnType<typeof useSearchSelection>['handleSelectProduct'];
  handleSplitInputKeyDown: BillingPaymentPanelProps['handleSplitInputKeyDown'];
  handleTotalInputKeyDown: (e: React.KeyboardEvent, productId: string) => void;
  handleWhatsAppSendActiveBill: BillingTotalsPanelProps['handleWhatsAppSendActiveBill'];
  igst: BillingTotalsPanelProps['igst'];
  invoiceType: BillingCustomerDetailsProps['invoiceType'];
  isB2B: BillingCustomerDetailsProps['isB2B'];
  isCheckingOut: BillingTotalsPanelProps['isCheckingOut'];
  isEditingTotal: BillingTotalsPanelProps['isEditingTotal'];
  isGrandTotalOverridden: BillingTotalsPanelProps['isGrandTotalOverridden'];
  isLoadingEditBill: BillingTotalsPanelProps['isLoadingEditBill'];
  isQuotationActive: BillingTotalsPanelProps['isQuotationActive'];
  isQuotationMode: BillingCustomerDetailsProps['isQuotationMode'];
  isReturnMode: BillingCustomerDetailsProps['isReturnMode'];
  isScrapMode: BillingCustomerDetailsProps['isScrapMode'];
  isSendingWhatsApp: BillingTotalsPanelProps['isSendingWhatsApp'];
  itemRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  kRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  localDiscFlats: Record<string, number>;
  localDiscPcts: Record<string, number>;
  localDiscText: BillingTotalsPanelProps['localDiscText'];
  localKgStr: Record<string, string>;
  localPcsStr: Record<string, string>;
  loyaltyCustomerData: BillingCustomerDetailsProps['loyaltyCustomerData'];
  loyaltyEnabled: BillingCustomerDetailsProps['loyaltyEnabled'];
  mostSoldProducts: MostSoldProductRow[];
  originalReturnTotal: BillingTotalsPanelProps['originalReturnTotal'];
  overrideTotalInput: BillingTotalsPanelProps['overrideTotalInput'];
  paymentMethod: BillingCustomerDetailsProps['paymentMethod'];
  paymentOptionRefs: BillingPaymentPanelProps['paymentOptionRefs'];
  paymentOptions: BillingPaymentPanelProps['paymentOptions'];
  pcsRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  pendingFocusProductIdRef: React.RefObject<string | null>;
  pricingTiers: BillingCustomerDetailsProps['pricingTiers'];
  productPricingMap: BillingCartViewProps['productPricingMap'];
  qtyRefs: BillingTotalsPanelProps['qtyRefs'];
  quotationSaving: BillingTotalsPanelProps['quotationSaving'];
  quotationTerms: BillingPaymentPanelProps['quotationTerms'];
  rateKgRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  ratePcRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  rawDisplayGrandTotal: BillingTotalsPanelProps['rawDisplayGrandTotal'];
  receivedAmount: BillingCustomerDetailsProps['receivedAmount'];
  receivedInputRef: BillingPaymentPanelProps['receivedInputRef'];
  refundAmount: BillingTotalsPanelProps['refundAmount'];
  returnDiscountTotal: BillingTotalsPanelProps['returnDiscountTotal'];
  returnProcessed: BillingTotalsPanelProps['returnProcessed'];
  returnProcessing: BillingTotalsPanelProps['returnProcessing'];
  returnTotal: BillingTotalsPanelProps['returnTotal'];
  sanitizeQtyText: (raw: string) => string;
  scrapPaymentStatus: BillingPaymentPanelProps['scrapPaymentStatus'];
  scrapTotal: BillingTotalsPanelProps['scrapTotal'];
  searchBarSection: BillingCartViewProps['searchBarSection'];
  searchRef: BillingTotalsPanelProps['searchRef'];
  selectedReturnInvoice: BillingPaymentPanelProps['selectedReturnInvoice'];
  selectedTierId: BillingCustomerDetailsProps['selectedTierId'];
  setActiveDiscField: BillingTotalsPanelProps['setActiveDiscField'];
  setCustomerState: BillingCustomerDetailsProps['setCustomerState'];
  setFocusedRowProductId: React.Dispatch<React.SetStateAction<string | null>>;
  setInfoToast: BillingPaymentPanelProps['setInfoToast'];
  setIsEditingTotal: BillingTotalsPanelProps['setIsEditingTotal'];
  setIsUpiSelectModalOpen: BillingPaymentPanelProps['setIsUpiSelectModalOpen'];
  setLocalDiscFlats: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setLocalDiscPcts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setLocalDiscText: BillingTotalsPanelProps['setLocalDiscText'];
  setLocalKgStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLocalPcsStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLoyaltyCustomerData: BillingCustomerDetailsProps['setLoyaltyCustomerData'];
  setOverrideTotalInput: BillingTotalsPanelProps['setOverrideTotalInput'];
  setQuotationTerms: BillingPaymentPanelProps['setQuotationTerms'];
  setShowLoyaltyRedemption: BillingTotalsPanelProps['setShowLoyaltyRedemption'];
  sgst: BillingTotalsPanelProps['sgst'];
  showDescriptionState: BillingPaymentPanelProps['showDescriptionState'];
  splitCardInputRef: BillingPaymentPanelProps['splitCardInputRef'];
  splitCashInputRef: BillingPaymentPanelProps['splitCashInputRef'];
  splitChequeInputRef: BillingPaymentPanelProps['splitChequeInputRef'];
  splitCreditInputRef: BillingPaymentPanelProps['splitCreditInputRef'];
  splitDetails: BillingCustomerDetailsProps['splitDetails'];
  splitTotal: BillingTotalsPanelProps['splitTotal'];
  splitUpiInputRef: BillingPaymentPanelProps['splitUpiInputRef'];
  startEditingTotal: BillingTotalsPanelProps['startEditingTotal'];
  subtotal: BillingTotalsPanelProps['subtotal'];
  tenantId: string | null;
  totalInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  totalKgs: BillingTotalsPanelProps['totalKgs'];
  totalOverrideInputRef: BillingTotalsPanelProps['totalOverrideInputRef'];
  totalPcs: BillingTotalsPanelProps['totalPcs'];
  totalProducts: BillingTotalsPanelProps['totalProducts'];
  totalTax: BillingTotalsPanelProps['totalTax'];
  uiConfig: BillingCustomerDetailsProps['uiConfig'];
  updateActiveTab: BillingCustomerDetailsProps['updateActiveTab'];
  upiPageConfig: BillingPaymentPanelProps['upiPageConfig'];
  upiSources: BillingPaymentPanelProps['upiSources'];
}

/** Main POS workspace (non-ERP layouts): most-sold strip, search + cart with customer details, and the payment / totals console. */
export function BillingWorkspace({
  activeCartProductIdRef, activeDiscField, activeTab, actualRefundPaid, canOverrideTier, cgst, checkoutBtnRef,
  commitTotalOverride, currentSelectedUpi, customerAddress, customerFields, customerGstin, customerHandlers,
  customerName, customerPhone, customerState, deductions, descriptionInputRef, discFlatRefs, discount,
  discountPercentRef, discountRef, discRefs, displayGrandTotal, editingActive, enableScrap, enableThreeInvoiceSeries,
  extraBonus, fillRestForField, filteredCustomerSuggestions, findMatchingParty, focusDescriptionOrDiscount,
  focusNextCartField, focusPrevCartField, getActiveTab, grandTotal, guardScannerInput, handleCheckout,
  handleDiscFlatKeyDown, handleDiscKeyDown, handleEditProduct, handleHoldBill, handleInvoiceTypeChange,
  handlePcsKeyDown, handlePricingTierChange, handleProcessReturnFromCart, handleQtyKeyDown, handleRateUpDown,
  handleResetGrandTotalOverride, handleSaveQuotation, handleSelectProduct, handleSplitInputKeyDown,
  handleTotalInputKeyDown, handleWhatsAppSendActiveBill, igst, invoiceType, isB2B, isCheckingOut, isEditingTotal,
  isGrandTotalOverridden, isLoadingEditBill, isQuotationActive, isQuotationMode, isReturnMode, isScrapMode,
  isSendingWhatsApp, itemRefs, kRefs, localDiscFlats, localDiscPcts, localDiscText, localKgStr, localPcsStr,
  loyaltyCustomerData, loyaltyEnabled, mostSoldProducts, originalReturnTotal, overrideTotalInput, paymentMethod,
  paymentOptionRefs, paymentOptions, pcsRefs, pendingFocusProductIdRef, pricingTiers, productPricingMap, qtyRefs,
  quotationSaving, quotationTerms, rateKgRefs, ratePcRefs, rawDisplayGrandTotal, receivedAmount, receivedInputRef,
  refundAmount, returnDiscountTotal, returnProcessed, returnProcessing, returnTotal, sanitizeQtyText,
  scrapPaymentStatus, scrapTotal, searchBarSection, searchRef, selectedReturnInvoice, selectedTierId,
  setActiveDiscField, setCustomerState, setFocusedRowProductId, setInfoToast, setIsEditingTotal,
  setIsUpiSelectModalOpen, setLocalDiscFlats, setLocalDiscPcts, setLocalDiscText, setLocalKgStr, setLocalPcsStr,
  setLoyaltyCustomerData, setOverrideTotalInput, setQuotationTerms, setShowLoyaltyRedemption, sgst,
  showDescriptionState, splitCardInputRef, splitCashInputRef, splitChequeInputRef, splitCreditInputRef, splitDetails,
  splitTotal, splitUpiInputRef, startEditingTotal, subtotal, tenantId, totalInputRefs, totalKgs,
  totalOverrideInputRef, totalPcs, totalProducts, totalTax, uiConfig, updateActiveTab, upiPageConfig, upiSources,
}: BillingWorkspaceProps) {
  return (
    <div 
      className={clsx(
        "flex flex-1 overflow-hidden bg-background transition-all duration-300",
        uiConfig.layoutModel === 'erp-grid-b2c' && "hidden",
        uiConfig.orientation === 'horizontal-stack' ? "flex-col" :
        uiConfig.layoutPosition === 'cart-right' ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* ═══ EXPRESS MOST SOLD PRODUCTS (3-COLUMN LAYOUT) ═══ */}
      {(uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar) && (
        <div className="w-[22%] border-r border-border bg-muted/20 p-3 space-y-2 shrink-0 hidden md:block overflow-y-auto">
          <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center justify-between">
            <span>Products - Most Sold</span>
            <TrendingUp className="w-3 h-3 text-amber-500" />
          </div>
          <div className="space-y-1.5">
            {mostSoldProducts.length > 0 ? (
              mostSoldProducts.map((prod) => (
                <button
                  key={prod.product_id || prod.id || prod.name}
                  onClick={() => handleSelectProduct(prod as B.BillingProduct)}
                  className="w-full text-left p-2.5 rounded-xl border border-border bg-card hover:bg-accent/10 hover:border-primary/40 text-foreground transition-all cursor-pointer shadow-xs active:scale-95 flex flex-col gap-0.5 group"
                >
                  <div className="text-xs font-bold truncate group-hover:text-primary transition-colors">{prod.name}</div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>₹{prod.base_price || 0}</span>
                    {prod.current_stock !== undefined && (
                      <span className={clsx(prod.current_stock as number <= 5 ? "text-amber-500 font-bold" : "")}>
                        Stock: {prod.current_stock}
                      </span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-xs text-muted-foreground italic text-center py-4">No products found</div>
            )}
          </div>
        </div>
      )}
      
      {/* ═══ TOP / LEFT SIDE: Search + Cart (Dynamic Width & Layout) ═══ */}
      <BillingCartView
        uiConfig={uiConfig}
        isLoadingEditBill={isLoadingEditBill}
        productPricingMap={productPricingMap}
        pricingTiers={pricingTiers}
        searchBarSection={searchBarSection}
        customerDetailsSection={<BillingCustomerDetails
          activeTab={activeTab}
          canOverrideTier={canOverrideTier}
          customerAddress={customerAddress}
          customerFields={customerFields}
          customerGstin={customerGstin}
          customerHandlers={customerHandlers}
          customerName={customerName}
          customerPhone={customerPhone}
          customerState={customerState}
          displayGrandTotal={displayGrandTotal}
          editingActive={editingActive}
          enableThreeInvoiceSeries={enableThreeInvoiceSeries}
          filteredCustomerSuggestions={filteredCustomerSuggestions}
          findMatchingParty={findMatchingParty}
          handleInvoiceTypeChange={handleInvoiceTypeChange}
          handlePricingTierChange={handlePricingTierChange}
          invoiceType={invoiceType}
          isB2B={isB2B}
          isQuotationMode={isQuotationMode}
          isReturnMode={isReturnMode}
          isScrapMode={isScrapMode}
          loyaltyCustomerData={loyaltyCustomerData}
          loyaltyEnabled={loyaltyEnabled}
          onGstSeriesChange={(series) => { void reserveGstSeriesNumber({ tenantId, getActiveTab, updateActiveTab }, series); }}
          paymentMethod={paymentMethod}
          pricingTiers={pricingTiers}
          receivedAmount={receivedAmount}
          selectedTierId={selectedTierId}
          setCustomerState={setCustomerState}
          setLoyaltyCustomerData={setLoyaltyCustomerData}
          splitDetails={splitDetails}
          uiConfig={uiConfig}
          updateActiveTab={updateActiveTab}
        />}
        localKgStr={localKgStr}
        setLocalKgStr={setLocalKgStr}
        localPcsStr={localPcsStr}
        setLocalPcsStr={setLocalPcsStr}
        localDiscPcts={localDiscPcts}
        setLocalDiscPcts={setLocalDiscPcts}
        localDiscFlats={localDiscFlats}
        setLocalDiscFlats={setLocalDiscFlats}
        itemRefs={itemRefs}
        qtyRefs={qtyRefs}
        pcsRefs={pcsRefs}
        kRefs={kRefs}
        rateKgRefs={rateKgRefs}
        ratePcRefs={ratePcRefs}
        discRefs={discRefs}
        discFlatRefs={discFlatRefs}
        totalInputRefs={totalInputRefs}
        pendingFocusProductIdRef={pendingFocusProductIdRef}
        activeCartProductIdRef={activeCartProductIdRef}
        setFocusedRowProductId={setFocusedRowProductId}
        focusNextCartField={focusNextCartField}
        focusPrevCartField={focusPrevCartField}
        handleRateUpDown={handleRateUpDown}
        handleEditProduct={handleEditProduct}
        handleQtyKeyDown={handleQtyKeyDown}
        handlePcsKeyDown={handlePcsKeyDown}
        handleDiscKeyDown={handleDiscKeyDown}
        handleDiscFlatKeyDown={handleDiscFlatKeyDown}
        handleTotalInputKeyDown={handleTotalInputKeyDown}
        guardScannerInput={guardScannerInput}
        sanitizeQtyText={sanitizeQtyText}
      />

      {/* ═══ RIGHT / BOTTOM SIDE: Transaction Console & Payment (Dynamic Width & Layout) ═══ */}
      <div 
        className={clsx(
          "bg-card dark:bg-card shadow-2xl z-25 transition-all duration-300",
          uiConfig.orientation === 'horizontal-stack'
            ? "w-full flex flex-row h-[320px] shrink-0 border-t-2 border-border overflow-hidden"
            : "flex flex-col " + (
              (uiConfig.orientation === 'three-column' || uiConfig.showQuickCategoryBar)
                ? "w-[30%] border-l border-border"
                : uiConfig.splitRatio === '50-50' ? "w-[50%] border-l border-border"
                : uiConfig.splitRatio === '65-35' ? "w-[35%] border-l border-border"
                : uiConfig.splitRatio === '70-30' ? "w-[30%] border-l border-border"
                : "w-[42%] border-l border-border"
            )
        )}
      >

        {/* ── Scrollable content area (Left Side of Bottom Bar in Horizontal Stack Mode) ── */}
        <BillingPaymentPanel
          currentSelectedUpi={currentSelectedUpi}
          deductions={deductions}
          descriptionInputRef={descriptionInputRef}
          discountRef={discountRef}
          displayGrandTotal={displayGrandTotal}
          fillRestForField={fillRestForField}
          focusDescriptionOrDiscount={focusDescriptionOrDiscount}
          handleSplitInputKeyDown={handleSplitInputKeyDown}
          paymentMethod={paymentMethod}
          paymentOptionRefs={paymentOptionRefs}
          paymentOptions={paymentOptions}
          quotationTerms={quotationTerms}
          receivedInputRef={receivedInputRef}
          scrapPaymentStatus={scrapPaymentStatus}
          selectedReturnInvoice={selectedReturnInvoice}
          setInfoToast={setInfoToast}
          setIsUpiSelectModalOpen={setIsUpiSelectModalOpen}
          setQuotationTerms={setQuotationTerms}
          showDescriptionState={showDescriptionState}
          splitCardInputRef={splitCardInputRef}
          splitCashInputRef={splitCashInputRef}
          splitChequeInputRef={splitChequeInputRef}
          splitCreditInputRef={splitCreditInputRef}
          splitDetails={splitDetails}
          splitUpiInputRef={splitUpiInputRef}
          uiConfig={uiConfig}
          upiPageConfig={upiPageConfig}
          upiSources={upiSources}
        />

        {/* ── STICKY FOOTER / RIGHT SIDE OF BOTTOM BAR: Totals + Actions ── */}
        <BillingTotalsPanel
          activeDiscField={activeDiscField}
          activeTab={activeTab}
          actualRefundPaid={actualRefundPaid}
          cgst={cgst}
          checkoutBtnRef={checkoutBtnRef}
          commitTotalOverride={commitTotalOverride}
          customerName={customerName}
          customerPhone={customerPhone}
          deductions={deductions}
          descriptionInputRef={descriptionInputRef}
          discount={discount}
          discountPercentRef={discountPercentRef}
          discountRef={discountRef}
          displayGrandTotal={displayGrandTotal}
          enableScrap={enableScrap}
          extraBonus={extraBonus}
          findMatchingParty={findMatchingParty}
          focusDescriptionOrDiscount={focusDescriptionOrDiscount}
          grandTotal={grandTotal}
          handleCheckout={handleCheckout}
          handleHoldBill={handleHoldBill}
          handleProcessReturnFromCart={handleProcessReturnFromCart}
          handleResetGrandTotalOverride={handleResetGrandTotalOverride}
          handleSaveQuotation={handleSaveQuotation}
          handleWhatsAppSendActiveBill={handleWhatsAppSendActiveBill}
          igst={igst}
          isCheckingOut={isCheckingOut}
          isEditingTotal={isEditingTotal}
          isGrandTotalOverridden={isGrandTotalOverridden}
          isLoadingEditBill={isLoadingEditBill}
          isQuotationActive={isQuotationActive}
          isSendingWhatsApp={isSendingWhatsApp}
          localDiscText={localDiscText}
          originalReturnTotal={originalReturnTotal}
          overrideTotalInput={overrideTotalInput}
          paymentMethod={paymentMethod}
          paymentOptionRefs={paymentOptionRefs}
          qtyRefs={qtyRefs}
          quotationSaving={quotationSaving}
          rawDisplayGrandTotal={rawDisplayGrandTotal}
          receivedAmount={receivedAmount}
          receivedInputRef={receivedInputRef}
          refundAmount={refundAmount}
          returnDiscountTotal={returnDiscountTotal}
          returnProcessed={returnProcessed}
          returnProcessing={returnProcessing}
          returnTotal={returnTotal}
          scrapTotal={scrapTotal}
          searchRef={searchRef}
          setActiveDiscField={setActiveDiscField}
          setIsEditingTotal={setIsEditingTotal}
          setLocalDiscText={setLocalDiscText}
          setOverrideTotalInput={setOverrideTotalInput}
          setShowLoyaltyRedemption={setShowLoyaltyRedemption}
          sgst={sgst}
          showDescriptionState={showDescriptionState}
          splitDetails={splitDetails}
          splitTotal={splitTotal}
          startEditingTotal={startEditingTotal}
          subtotal={subtotal}
          totalKgs={totalKgs}
          totalOverrideInputRef={totalOverrideInputRef}
          totalPcs={totalPcs}
          totalProducts={totalProducts}
          totalTax={totalTax}
          uiConfig={uiConfig}
        />

      </div>

    </div>
  );
}
