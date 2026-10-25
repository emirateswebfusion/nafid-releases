import { useState } from 'react';
import { type UpiPageConfig, DEFAULT_UPI_PAGE_CONFIG } from '../../../utils/upiConfig';
import { type MostSoldProductRow } from '../productSearch';
import { type DeductionSearchRow } from '../deductionLookup';

/**
 * Local UI state of the billing page: per-line input text, pricing tier, UPI / biller PIN dialogs, deduction searches,
 * loyalty redemption, ERP narration, checkout / toast flags, total override, return processing, held bills and quotation
 * saving. Cart, tabs and settings live in their stores.
 */
export function useBillingPageState() {
  // Local state for per-item two-way discount binding (like CashierSettlement)
  const [localDiscPcts, setLocalDiscPcts] = useState<Record<string, number>>({});
  const [localDiscFlats, setLocalDiscFlats] = useState<Record<string, number>>({});
  // Local string state for Pcs and Kg inputs — lets user type multi-digit values
  // without every keystroke triggering a cross-field recalculation.
  const [localPcsStr, setLocalPcsStr] = useState<Record<string, string>>({});
  const [localKgStr, setLocalKgStr] = useState<Record<string, string>>({});
  // Pricing tier state
  const [productPricingMap, setProductPricingMap] = useState<Record<string, Record<string, number>>>({});
  const [selectedTierId, setSelectedTierId] = useState('');
  // Page-wise UPI Configuration and sources state
  const [upiPageConfig, setUpiPageConfig] = useState<UpiPageConfig>(DEFAULT_UPI_PAGE_CONFIG);
  const [isUpiSelectModalOpen, setIsUpiSelectModalOpen] = useState(false);
  const [isBillerPinModalOpen, setIsBillerPinModalOpen] = useState(false);
  const [partiesForTier, setPartiesForTier] = useState<any[]>([]);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [mostSoldProducts, setMostSoldProducts] = useState<MostSoldProductRow[]>([]);
  const [scrapDeductionSearchQuery, setScrapDeductionSearchQuery] = useState('');
  const [scrapDeductionResults, setScrapDeductionResults] = useState<DeductionSearchRow[]>([]);
  // Return deduction search (similar to scrap deduction search)
  const [returnDeductionSearchQuery, setReturnDeductionSearchQuery] = useState('');
  const [returnDeductionResults, setReturnDeductionResults] = useState<DeductionSearchRow[]>([]);
  const [, setReturnDeductionSearchMode] = useState(false);
  const [deductionTabMode, setDeductionTabMode] = useState<'scrap' | 'return' | 'points'>('scrap');
  // Loyalty points state
  const [loyaltyCustomerData, setLoyaltyCustomerData] = useState<{
    customerId: string | null;
    pointsBalance: number;
  }>({ customerId: null, pointsBalance: 0 });
  const [showLoyaltyRedemption, setShowLoyaltyRedemption] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  // Modern ERP B2C Grid States (Acro / Tally Desktop ERP Model)
  const [erpNarration, setErpNarration] = useState('');
  const [erpSalesRep, setErpSalesRep] = useState('');
  const [focusedRowProductId, setFocusedRowProductId] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<'saved' | 'printed' | false>(false);
  const [upiAccountToast, setUpiAccountToast] = useState<string | null>(null);
  const [returnSuccessToast, setReturnSuccessToast] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [activeDiscField, setActiveDiscField] = useState<'PCT' | 'FLAT' | null>(null);
  const [localDiscText, setLocalDiscText] = useState<string>('');
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [overrideTotalInput, setOverrideTotalInput] = useState('');
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  // Local return mode transient state
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<any | null>(null);
  const [returnProcessing, setReturnProcessing] = useState(false);
  const [returnProcessed, setReturnProcessed] = useState(false);
  // Scrap invoice view state
  const [showScrapInvoiceView, setShowScrapInvoiceView] = useState(false);
  const [scrapInvoiceViewData, setScrapInvoiceViewData] = useState<{ transactions: any[]; totalAmount: number; invoiceNumber: string } | null>(null);
  const [scrapInvoiceViewLoading, _setScrapInvoiceViewLoading] = useState(false);
  // Quotation state
  const [quotationTerms, setQuotationTerms] = useState('1. Prices are subject to change without prior notice.\n2. This quotation is valid for 15 days.\n3. GST extra as applicable.');
  const [quotationSaving, setQuotationSaving] = useState(false);
  const [quotationSuccess, setQuotationSuccess] = useState<string | null>(null);
  const [scrapDeductionDropdownStyle, setScrapDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [returnDeductionDropdownStyle, setReturnDeductionDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [isLoadingEditBill, setIsLoadingEditBill] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldBillsPanel, setShowHeldBillsPanel] = useState(false);
  const [heldBillsLoading, setHeldBillsLoading] = useState(false);

  return {
    localDiscPcts, setLocalDiscPcts, localDiscFlats, setLocalDiscFlats, localPcsStr, setLocalPcsStr, localKgStr,
    setLocalKgStr, productPricingMap, setProductPricingMap, selectedTierId, setSelectedTierId, upiPageConfig,
    setUpiPageConfig, isUpiSelectModalOpen, setIsUpiSelectModalOpen, isBillerPinModalOpen, setIsBillerPinModalOpen,
    partiesForTier, setPartiesForTier, showTransportModal, setShowTransportModal, mostSoldProducts,
    setMostSoldProducts, scrapDeductionSearchQuery, setScrapDeductionSearchQuery, scrapDeductionResults,
    setScrapDeductionResults, returnDeductionSearchQuery, setReturnDeductionSearchQuery, returnDeductionResults,
    setReturnDeductionResults, setReturnDeductionSearchMode, deductionTabMode, setDeductionTabMode,
    loyaltyCustomerData, setLoyaltyCustomerData, showLoyaltyRedemption, setShowLoyaltyRedemption, pointsToRedeem,
    setPointsToRedeem, erpNarration, setErpNarration, erpSalesRep, setErpSalesRep, focusedRowProductId,
    setFocusedRowProductId, isCheckingOut, setIsCheckingOut, hardwareError, setHardwareError, checkoutSuccess,
    setCheckoutSuccess, upiAccountToast, setUpiAccountToast, returnSuccessToast, setReturnSuccessToast, infoToast,
    setInfoToast, activeDiscField, setActiveDiscField, localDiscText, setLocalDiscText, isEditingTotal,
    setIsEditingTotal, overrideTotalInput, setOverrideTotalInput, cashRegisterOpen, setCashRegisterOpen,
    selectedReturnInvoice, setSelectedReturnInvoice, returnProcessing, setReturnProcessing, returnProcessed,
    setReturnProcessed, showScrapInvoiceView, setShowScrapInvoiceView, scrapInvoiceViewData, setScrapInvoiceViewData,
    scrapInvoiceViewLoading, _setScrapInvoiceViewLoading, quotationTerms, setQuotationTerms, quotationSaving,
    setQuotationSaving, quotationSuccess, setQuotationSuccess, scrapDeductionDropdownStyle,
    setScrapDeductionDropdownStyle, returnDeductionDropdownStyle, setReturnDeductionDropdownStyle, isLoadingEditBill,
    setIsLoadingEditBill, isSendingWhatsApp, setIsSendingWhatsApp, heldBills, setHeldBills, showHeldBillsPanel,
    setShowHeldBillsPanel, heldBillsLoading, setHeldBillsLoading,
  };
}

export type BillingPageState = ReturnType<typeof useBillingPageState>;
