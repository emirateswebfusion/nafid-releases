import { useState } from 'react';

/**
 * Billing configuration read from settings: shop profile and bank / UPI details, loyalty rules, invoice-series and
 * scrap / paper-stock switches, quotation GST, bill-of-supply tax, pricing tiers and UPI accounts, terminal code.
 * Written only by `useBillingSettingsLoader` (initial load and `settings:updated`); BillingPage reads it.
 */
export function useBillingSettings() {
  const [bosTaxRatePercent, setBosTaxRatePercent] = useState(0);
  const [bosTaxInclusive, setBosTaxInclusive] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<any[]>([]);
  const [productPricingMapLoaded, setProductPricingMapLoaded] = useState(false);
  const [upiSources, setUpiSources] = useState<any[]>([]);
  const [allowBillerOverride, setAllowBillerOverride] = useState(true);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(100);
  const [loyaltyRedemptionRate, setLoyaltyRedemptionRate] = useState(1);
  const [loyaltyAwardOnPending, setLoyaltyAwardOnPending] = useState(false);
  const [showDescriptionState, setShowDescriptionState] = useState(true);
  const [enableThreeInvoiceSeries, setEnableThreeInvoiceSeries] = useState(false);
  const [enableScrap, setEnableScrap] = useState(true);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [enableRealPaperStock, setEnableRealPaperStock] = useState(true);
  const [showPaperInGstSetting, setShowPaperInGstSetting] = useState(true);
  const [showPaperInEstSetting, setShowPaperInEstSetting] = useState(false);
  const [terminalCodeState, setTerminalCodeState] = useState('POS1');
  const [shopNameState, setShopNameState] = useState('');
  const [shopGstin, setShopGstin] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopState, setShopState] = useState('');
  const [quotationGstEnabledSetting, setQuotationGstEnabledSetting] = useState(true);
  const [shopEmail, setShopEmail] = useState('');
  const [shopWebsite, setShopWebsite] = useState('');
  const [upiId, setUpiId] = useState('');
  const [showUpiQr, setShowUpiQr] = useState(true);
  const [bankNameState, setBankNameState] = useState('');
  const [bankAccountState, setBankAccountState] = useState('');
  const [bankIfscState, setBankIfscState] = useState('');
  const [bankBranchState, setBankBranchState] = useState('');

  return {
    bosTaxRatePercent, setBosTaxRatePercent, bosTaxInclusive, setBosTaxInclusive, pricingTiers, setPricingTiers,
    productPricingMapLoaded, setProductPricingMapLoaded, upiSources, setUpiSources, allowBillerOverride, setAllowBillerOverride,
    loyaltyEnabled, setLoyaltyEnabled, loyaltyEarningRate, setLoyaltyEarningRate, loyaltyRedemptionRate, setLoyaltyRedemptionRate,
    loyaltyAwardOnPending, setLoyaltyAwardOnPending, showDescriptionState, setShowDescriptionState, enableThreeInvoiceSeries, setEnableThreeInvoiceSeries,
    enableScrap, setEnableScrap, showCashRegister, setShowCashRegister, enableRealPaperStock, setEnableRealPaperStock,
    showPaperInGstSetting, setShowPaperInGstSetting, showPaperInEstSetting, setShowPaperInEstSetting, terminalCodeState, setTerminalCodeState,
    shopNameState, setShopNameState, shopGstin, setShopGstin, shopAddress, setShopAddress,
    shopPhone, setShopPhone, shopState, setShopState, quotationGstEnabledSetting, setQuotationGstEnabledSetting,
    shopEmail, setShopEmail, shopWebsite, setShopWebsite, upiId, setUpiId,
    showUpiQr, setShowUpiQr, bankNameState, setBankNameState, bankAccountState, setBankAccountState,
    bankIfscState, setBankIfscState, bankBranchState, setBankBranchState,
  };
}

export type BillingSettingsState = ReturnType<typeof useBillingSettings>;
