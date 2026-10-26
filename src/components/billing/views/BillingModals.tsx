import React from 'react';
import { HeldBillsModal } from '../modals/HeldBillsModal';
import { ScrapInvoiceViewModal } from '../modals/ScrapInvoiceViewModal';
import { DeductionDropdowns } from './DeductionDropdowns';
import { CreateProductModal } from '../modals/CreateProductModal';
import { handleFormKeyDown } from '../productFormKeyNav';
import { CreateNewGradeModal } from '../modals/CreateNewGradeModal';
import { CashierSettlement } from '../../CashierSettlement';
import { UpiAccountSelectModal } from '../modals/UpiAccountSelectModal';
import { TransportDetailsModal } from '../modals/TransportDetailsModal';
import { BillerPinModal } from '../../BillerPinModal';
import { useCartStore } from '../../../store/cartStore';
import type { DeductionDropdownsProps } from './DeductionDropdowns';
import type { CreateProductModalProps } from '../modals/CreateProductModal';
import type { UpiAccountSelectModalProps } from '../modals/UpiAccountSelectModal';

export interface BillingModalsProps {
  activeTab: React.ComponentProps<typeof TransportDetailsModal>['activeTab'];
  cashRegisterOpen: boolean;
  currentSelectedUpi: UpiAccountSelectModalProps['currentSelectedUpi'];
  enableRealPaperStock: CreateProductModalProps['enableRealPaperStock'];
  focusDescriptionOrDiscount: UpiAccountSelectModalProps['focusDescriptionOrDiscount'];
  generateProductBarcode: CreateProductModalProps['generateProductBarcode'];
  gradeFormDialogRef: React.RefObject<HTMLDivElement | null>;
  handleCheckout: (saveOnly?: boolean) => Promise<void>;
  handleCreateAndAddProduct: CreateProductModalProps['handleCreateAndAddProduct'];
  handleCreateNewGrade: () => Promise<void>;
  handleProductBasePriceChange: CreateProductModalProps['handleProductBasePriceChange'];
  handleProductGradeChange: CreateProductModalProps['handleProductGradeChange'];
  handleProductPurchasePriceChange: CreateProductModalProps['handleProductPurchasePriceChange'];
  handleRecallHeldBill: React.ComponentProps<typeof HeldBillsModal>['handleRecallHeldBill'];
  handleReleaseHeldBill: React.ComponentProps<typeof HeldBillsModal>['handleReleaseHeldBill'];
  heldBills: React.ComponentProps<typeof HeldBillsModal>['heldBills'];
  heldBillsLoading: React.ComponentProps<typeof HeldBillsModal>['heldBillsLoading'];
  invoiceType: CreateProductModalProps['invoiceType'];
  isBillerPinModalOpen: boolean;
  isUpiSelectModalOpen: boolean;
  newProductCategory: string;
  newProductGradeForm: { grade_name: string; purchase_price: string; rate: string; offer_price: string; };
  newProductIsAddingGrade: boolean;
  newProductSavingGrade: boolean;
  paymentOptionRefs: UpiAccountSelectModalProps['paymentOptionRefs'];
  pendingCheckoutSaveOnlyRef: React.RefObject<boolean | null>;
  pricingTiers: CreateProductModalProps['pricingTiers'];
  productForm: CreateProductModalProps['productForm'];
  resetProductForm: CreateProductModalProps['resetProductForm'];
  returnDeductionDropdownStyle: DeductionDropdownsProps['returnDeductionDropdownStyle'];
  returnDeductionResults: DeductionDropdownsProps['returnDeductionResults'];
  scrapDeductionDropdownStyle: DeductionDropdownsProps['scrapDeductionDropdownStyle'];
  scrapDeductionResults: DeductionDropdownsProps['scrapDeductionResults'];
  scrapInvoiceViewData: React.ComponentProps<typeof ScrapInvoiceViewModal>['data'];
  scrapInvoiceViewLoading: boolean;
  setCashRegisterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setHardwareError: DeductionDropdownsProps['setHardwareError'];
  setIsBillerPinModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsUpiSelectModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNewProductGradeForm: React.Dispatch<React.SetStateAction<{ grade_name: string; purchase_price: string; rate: string; offer_price: string; }>>;
  setNewProductIsAddingGrade: React.Dispatch<React.SetStateAction<boolean>>;
  setReturnDeduction: DeductionDropdownsProps['setReturnDeduction'];
  setReturnDeductionDropdownStyle: DeductionDropdownsProps['setReturnDeductionDropdownStyle'];
  setReturnDeductionResults: DeductionDropdownsProps['setReturnDeductionResults'];
  setReturnDeductionSearchQuery: DeductionDropdownsProps['setReturnDeductionSearchQuery'];
  setScrapDeduction: DeductionDropdownsProps['setScrapDeduction'];
  setScrapDeductionDropdownStyle: DeductionDropdownsProps['setScrapDeductionDropdownStyle'];
  setScrapDeductionResults: DeductionDropdownsProps['setScrapDeductionResults'];
  setScrapDeductionSearchQuery: DeductionDropdownsProps['setScrapDeductionSearchQuery'];
  /** Only ever reset here. */
  setScrapInvoiceViewData: (value: null) => void;
  setShowHeldBillsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowScrapInvoiceView: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTransportModal: React.Dispatch<React.SetStateAction<boolean>>;
  setUpiAccountToast: UpiAccountSelectModalProps['setUpiAccountToast'];
  showHeldBillsPanel: boolean;
  showProductCreateForm: boolean;
  showScrapInvoiceView: boolean;
  showTransportModal: boolean;
  tenantId: DeductionDropdownsProps['tenantId'];
  updateActiveTab: React.ComponentProps<typeof TransportDetailsModal>['updateActiveTab'];
  upiSources: UpiAccountSelectModalProps['upiSources'];
}

/** Billing page dialogs: held bills, scrap invoice view, deduction dropdowns, create product / grade, cash register, UPI account select, transport details and biller PIN. */
export function BillingModals({
  activeTab, cashRegisterOpen, currentSelectedUpi, enableRealPaperStock, focusDescriptionOrDiscount,
  generateProductBarcode, gradeFormDialogRef, handleCheckout, handleCreateAndAddProduct, handleCreateNewGrade,
  handleProductBasePriceChange, handleProductGradeChange, handleProductPurchasePriceChange, handleRecallHeldBill,
  handleReleaseHeldBill, heldBills, heldBillsLoading, invoiceType, isBillerPinModalOpen, isUpiSelectModalOpen,
  newProductCategory, newProductGradeForm, newProductIsAddingGrade, newProductSavingGrade, paymentOptionRefs,
  pendingCheckoutSaveOnlyRef, pricingTiers, productForm, resetProductForm, returnDeductionDropdownStyle,
  returnDeductionResults, scrapDeductionDropdownStyle, scrapDeductionResults, scrapInvoiceViewData,
  scrapInvoiceViewLoading, setCashRegisterOpen, setHardwareError, setIsBillerPinModalOpen, setIsUpiSelectModalOpen,
  setNewProductGradeForm, setNewProductIsAddingGrade, setReturnDeduction, setReturnDeductionDropdownStyle,
  setReturnDeductionResults, setReturnDeductionSearchQuery, setScrapDeduction, setScrapDeductionDropdownStyle,
  setScrapDeductionResults, setScrapDeductionSearchQuery, setScrapInvoiceViewData, setShowHeldBillsPanel,
  setShowScrapInvoiceView, setShowTransportModal, setUpiAccountToast, showHeldBillsPanel, showProductCreateForm,
  showScrapInvoiceView, showTransportModal, tenantId, updateActiveTab, upiSources,
}: BillingModalsProps) {
  return (
    <>
    {/* ─── Held Bills / Drafts Modal ─── */}
    <HeldBillsModal
      isOpen={showHeldBillsPanel}
      onClose={() => setShowHeldBillsPanel(false)}
      heldBills={heldBills}
      heldBillsLoading={heldBillsLoading}
      handleRecallHeldBill={handleRecallHeldBill}
      handleReleaseHeldBill={handleReleaseHeldBill}
    />

    {/* ─── Scrap Invoice View Modal ─── */}
    <ScrapInvoiceViewModal
      isOpen={showScrapInvoiceView}
      onClose={() => {
        setShowScrapInvoiceView(false);
        setScrapInvoiceViewData(null);
      }}
      loading={scrapInvoiceViewLoading}
      data={scrapInvoiceViewData}
    />

    {/* ─── Return Deduction Dropdown (fixed position) ─── */}
    <DeductionDropdowns
      returnDeductionDropdownStyle={returnDeductionDropdownStyle} returnDeductionResults={returnDeductionResults}
      scrapDeductionDropdownStyle={scrapDeductionDropdownStyle} scrapDeductionResults={scrapDeductionResults}
      setHardwareError={setHardwareError} setReturnDeduction={setReturnDeduction}
      setReturnDeductionDropdownStyle={setReturnDeductionDropdownStyle}
      setReturnDeductionResults={setReturnDeductionResults}
      setReturnDeductionSearchQuery={setReturnDeductionSearchQuery} setScrapDeduction={setScrapDeduction}
      setScrapDeductionDropdownStyle={setScrapDeductionDropdownStyle}
      setScrapDeductionResults={setScrapDeductionResults} setScrapDeductionSearchQuery={setScrapDeductionSearchQuery}
      tenantId={tenantId}
    />

    <CreateProductModal
      isOpen={showProductCreateForm}
      handleFormKeyDown={handleFormKeyDown}
      resetProductForm={resetProductForm}
      generateProductBarcode={generateProductBarcode}
      invoiceType={invoiceType}
      handleProductGradeChange={handleProductGradeChange}
      handleProductPurchasePriceChange={handleProductPurchasePriceChange}
      handleProductBasePriceChange={handleProductBasePriceChange}
      enableRealPaperStock={enableRealPaperStock}
      pricingTiers={pricingTiers}
      handleCreateAndAddProduct={handleCreateAndAddProduct}
      productForm={productForm}
    />
    <div ref={gradeFormDialogRef}>
      <CreateNewGradeModal
        isOpen={newProductIsAddingGrade}
        onClose={() => {
          setNewProductIsAddingGrade(false);
          setNewProductGradeForm({ grade_name: '', purchase_price: '', rate: '', offer_price: '' });
        }}
        category={newProductCategory}
        form={newProductGradeForm}
        setForm={setNewProductGradeForm}
        onKeyDown={handleFormKeyDown}
        onSubmit={handleCreateNewGrade}
        saving={newProductSavingGrade}
      />
    </div>
    {cashRegisterOpen && (
      <CashierSettlement onClose={() => setCashRegisterOpen(false)} />
    )}

    <UpiAccountSelectModal
      isOpen={isUpiSelectModalOpen}
      onClose={() => setIsUpiSelectModalOpen(false)}
      upiSources={upiSources}
      currentSelectedUpi={currentSelectedUpi}
      updateActiveTab={updateActiveTab}
      setUpiAccountToast={setUpiAccountToast}
      focusDescriptionOrDiscount={focusDescriptionOrDiscount}
      paymentOptionRefs={paymentOptionRefs}
    />

    <TransportDetailsModal
      isOpen={showTransportModal}
      onClose={() => setShowTransportModal(false)}
      activeTab={activeTab}
      updateActiveTab={updateActiveTab}
    />

    <BillerPinModal
      isOpen={isBillerPinModalOpen}
      tenantId={tenantId || 'global'}
      onClose={() => {
        pendingCheckoutSaveOnlyRef.current = null;
        setIsBillerPinModalOpen(false);
      }}
      onVerified={(staff) => {
        useCartStore.getState().setBillerStaff(staff.staff_id, staff.name);
        setIsBillerPinModalOpen(false);
        const saveOnlyMode = pendingCheckoutSaveOnlyRef.current ?? false;
        pendingCheckoutSaveOnlyRef.current = null;
        setTimeout(() => {
          handleCheckout(saveOnlyMode);
        }, 50);
      }}
    />
    </>
  );
}
