import React from 'react';
import { FilingOnlySettings } from '../FilingOnlySettings';
import { FinancialYearSettings } from '../FinancialYearSettings';
import { UaeEinvoiceSettings } from '../UaeEinvoiceSettings';
import { EmergencyPurgeSettings } from '../EmergencyPurgeSettings';
import { StaffDataMaskingSettings } from '../StaffDataMaskingSettings';
import { DesignSettings } from '../../design-settings/DesignSettings';
import { LedgerTerminologySettings } from '../LedgerTerminologySettings';
import { BillingUICustomizer } from '../../billing-ui-customizer/BillingUICustomizer';
import { DashboardCardCustomizer } from '../../owner-dashboard/DashboardCardCustomizer';
import { StoreSettingsTab } from '../tabs/StoreSettingsTab';
import { WhatsAppSettingsTab } from '../tabs/WhatsAppSettingsTab';
import { HardwareSettingsTab } from '../tabs/HardwareSettingsTab';
import { ProductsSettingsTab } from '../tabs/ProductsSettingsTab';
import { isAdminRole } from '../../../utils/security/permissions';
import { PrintingSettingsTab } from '../tabs/PrintingSettingsTab';
import { PrintOptionsSettingsTab } from '../tabs/PrintOptionsSettingsTab';
import { SystemPreferencesTab } from '../tabs/SystemPreferencesTab';
import { FeaturesTab } from '../tabs/FeaturesTab';
import { NetworkSyncTab } from '../tabs/NetworkSyncTab';
import { TaxBankSettingsTab } from '../tabs/TaxBankSettingsTab';
import { NumberingSettingsTab } from '../tabs/NumberingSettingsTab';
import { BillingRulesTab } from '../tabs/BillingRulesTab';
import { CashDrawerSettingsTab } from '../tabs/CashDrawerSettingsTab';
import { CustomersLoyaltyTab } from '../tabs/CustomersLoyaltyTab';
import { LabelSettingsTab } from '../tabs/LabelSettingsTab';
import { AccountSecurityTab } from '../tabs/AccountSecurityTab';
import { InventoryDisplaySettings } from '../tabs/InventoryDisplaySettings';
import type { FeatureFlags, FeatureKey } from '../../../config/featureFlags';
import type { SettingsFormState } from '../hooks/useSettingsFormState';

export interface SettingsSectionContentProps {
  activeSection: string;
  featureFlags: FeatureFlags | null;
  onFlagsChange?: (flags: FeatureFlags) => void;
  fetchPrinters: (showToast?: boolean) => Promise<void>;
  handleChangePassword: (e: React.FormEvent) => Promise<void>;
  handleInstallUpdate: () => void;
  handleRetryDownload: () => void;
  handleToggleFeatureFlag: (key: FeatureKey, nextVal?: boolean) => void;
  returnPrefix: string;
  returnStartNumber: string | number;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  sectionId: string;
  setActiveSection: React.Dispatch<React.SetStateAction<string>>;
  tenantId: string | null;
  form: SettingsFormState;
}

/** Content of the selected settings section (shop, billing, numbering, printing, tax, sync, hardware, WhatsApp, ... tabs). */
export function SettingsSectionContent({
  activeSection, featureFlags, onFlagsChange, fetchPrinters, handleChangePassword, handleInstallUpdate, handleRetryDownload,
  handleToggleFeatureFlag, returnPrefix, returnStartNumber, role, sectionId, setActiveSection, tenantId, form,
}: SettingsSectionContentProps) {
  const { a4Printer, a4Style, a5Orientation, activeHardwareTab, activeProductsTab, activeWhatsAppTab, appVersion, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, autoPrintBarcode, autoWhatsAppSend, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, bankAccount, bankBranch, bankIfsc, bankName, barcodePrinter, billingUIConfig, billSettings, changingPass, connectCode, copiedCode, copiedFirewallCmd, defaultOpeningBalance, detectedLocalIp, downloadProgress, drainingQueue, effectiveCloudState, emergencyPanicConfig, enableConvertToGst, enablePartyEstimate, enablePartyGst, enableRealPaperStock, enableThreeInvoiceSeries, gstConversionTaxInclusive, gstProfitPercentage, inventoryDefaultView, invoiceStartNumber, isDownloading, labelCodeType, labelShowShopName, lanHostIp, lanPort, lanRole, lastChecked, loyaltyIncludeTax, setLoyaltyIncludeTax, loyaltyAwardOnPending, loyaltyEarningRate, loyaltyRedemptionRate, networkDetails, openCashDrawerOnPending, osPrinters, pass, priceCoding, printersLoading, printFormat, printWidth, purchaseBillPrefix, purchaseBillStartNumber, quotationPrefix, quotationStartNumber, receiptFont, receiptPrinter, saving, scale, scrapBillSettings, scrapPrefix, scrapStartNumber, serviceChargeBarcode, setA4Printer, setA4Style, setA5Orientation, setActiveHardwareTab, setActiveProductsTab, setActiveWhatsAppTab, setAutoCloseCashDrawer, setAutoCloseCashDrawerTime, setAutoOpenCashDrawer, setAutoPrintBarcode, setAutoWhatsAppSend, setB2bPrefix, setB2bStartNumber, setB2cPrefix, setB2cStartNumber, setBankAccount, setBankBranch, setBankIfsc, setBankName, setBarcodePrinter, setBillingUIConfig, setBillSettings, setConfirmTurnOffAllModalOpen, setCopiedCode, setCopiedFirewallCmd, setDefaultOpeningBalance, setDrainingQueue, setEffectiveCloudState, setEmergencyPanicConfig, setEnableConvertToGst, setEnablePartyEstimate, setEnablePartyGst, setEnableRealPaperStock, setEnableThreeInvoiceSeries, setGstConversionTaxInclusive, setGstProfitPercentage, setInventoryDefaultView, setInvoiceStartNumber, setLabelCodeType, setLabelShowShopName, setLanHostIp, setLanRole, setLoyaltyAwardOnPending, setLoyaltyEarningRate, setLoyaltyRedemptionRate, setMessage, setNetworkDetails, setOpenCashDrawerOnPending, setPass, setPreviewFormat, setPreviewStyle, setPriceCoding, setPrintFormat, setPrintWidth, setPurchaseBillPrefix, setPurchaseBillStartNumber, setQuotationPrefix, setQuotationStartNumber, setReceiptFont, setReceiptPrinter, setReturnPrefix, setReturnStartNumber, setScale, setScrapBillSettings, setScrapPrefix, setScrapStartNumber, setServiceChargeBarcode, setShopAddress, setShopClosingConfig, setShopEmail, setShopGstin, setShopNameLocal, setShopPhone, setShopState, setShopWebsite, setShowBulkSheet, setShowCashRegister, setShowConfirmPass, setShowFullyPaidCashInLedger, setShowLanHelpModal, setShowNewPass, setShowOldPass, setShowPaperOnlyProducts, setShowPaperStockInEstimate, setShowPaperStockInGst, setShowPriceOverrideMrp, setShowPriceTiersInInventory, setShowProductGstBadge, setShowProductOffers, setShowUpiQr, setShowZeroPaperStock, setStaffDataMaskingConfig, setStockReportDefaultView, setVatPriceInclusive, setStoreCountryState, setStoreTimezoneState, setSyncFrequency, setSyncMode, setTerminalCode, setTestingNetwork, setThermalStyle, setTimeFormat, setUpiId, setWhatsNewLang, shopAddress, shopClosingConfig, shopEmail, shopGstin, shopNameLocal, shopPhone, shopState, shopWebsite, showBulkSheet, showConfirmPass, showFullyPaidCashInLedger, showLanHelpModal, showNewPass, showOldPass, showPaperOnlyProducts, showPaperStockInEstimate, showPaperStockInGst, showPriceOverrideMrp, showPriceTiersInInventory, showProductGstBadge, showProductOffers, showUpiQr, showZeroPaperStock, staffDataMaskingConfig, stockReportDefaultView, vatPriceInclusive, storeCountry, storeTimezone, syncFrequency, syncMode, terminalCode, testingNetwork, thermalStyle, timeFormat, updateInfo, updateReady, updateStatus, upiId, whatsNewLang } = form;

  switch (sectionId) {
    case 'emergency_purge':
      return (
        <EmergencyPurgeSettings
          config={emergencyPanicConfig}
          onChange={setEmergencyPanicConfig}
        />
      );
    case 'staff_masking':
      return (
        <StaffDataMaskingSettings
          config={staffDataMaskingConfig}
          onChange={setStaffDataMaskingConfig}
        />
      );
    case 'design':
      return <DesignSettings />;
    case 'terminology':
      return <LedgerTerminologySettings />;
    case 'billing_ui':
      return (
        <BillingUICustomizer
          config={billingUIConfig}
          onChange={(newCfg) => {
            setBillingUIConfig(newCfg);
          }}
        />
      );
    case 'dashboard_cards':
      return (
        <div className="space-y-6 animate-in fade-in duration-300 w-full pb-12">
          <DashboardCardCustomizer />
        </div>
      );
    case 'filing_only':
      return <FilingOnlySettings tenantId={tenantId} />;
    case 'financial_year':
      return <FinancialYearSettings tenantId={tenantId} terminalCode={terminalCode} />;
    case 'uae_einvoice':
      return <UaeEinvoiceSettings tenantId={tenantId} />;
    case 'store':
      return (
        <StoreSettingsTab
          connectCode={connectCode}
          copiedCode={copiedCode}
          setCopiedCode={setCopiedCode}
          shopNameLocal={shopNameLocal} setShopNameLocal={setShopNameLocal}
          shopAddress={shopAddress} setShopAddress={setShopAddress}
          shopPhone={shopPhone} setShopPhone={setShopPhone}
          shopEmail={shopEmail} setShopEmail={setShopEmail}
          shopWebsite={shopWebsite} setShopWebsite={setShopWebsite}
          vatPriceInclusive={vatPriceInclusive} setVatPriceInclusive={setVatPriceInclusive}
          storeCountry={storeCountry} setStoreCountryState={setStoreCountryState}
          storeTimezone={storeTimezone} setStoreTimezoneState={setStoreTimezoneState}
        />
      );

    case 'tax_bank':
      return (
        <TaxBankSettingsTab
          storeCountry={storeCountry}
          shopGstin={shopGstin} setShopGstin={setShopGstin}
          shopState={shopState} setShopState={setShopState}
          gstProfitPercentage={gstProfitPercentage} setGstProfitPercentage={setGstProfitPercentage}
          gstConversionTaxInclusive={gstConversionTaxInclusive} setGstConversionTaxInclusive={setGstConversionTaxInclusive}
          bankName={bankName} setBankName={setBankName}
          bankAccount={bankAccount} setBankAccount={setBankAccount}
          bankIfsc={bankIfsc} setBankIfsc={setBankIfsc}
          bankBranch={bankBranch} setBankBranch={setBankBranch}
          upiId={upiId} setUpiId={setUpiId}
          showUpiQr={showUpiQr} setShowUpiQr={setShowUpiQr}
        />
      );

    case 'numbering':
      return (
        <NumberingSettingsTab
          terminalCode={terminalCode} setTerminalCode={setTerminalCode}
          invoiceStartNumber={invoiceStartNumber} setInvoiceStartNumber={setInvoiceStartNumber}
          enableThreeInvoiceSeries={enableThreeInvoiceSeries} setEnableThreeInvoiceSeries={setEnableThreeInvoiceSeries}
          b2bPrefix={b2bPrefix} setB2bPrefix={setB2bPrefix}
          b2bStartNumber={b2bStartNumber} setB2bStartNumber={setB2bStartNumber}
          b2cPrefix={b2cPrefix} setB2cPrefix={setB2cPrefix}
          b2cStartNumber={b2cStartNumber} setB2cStartNumber={setB2cStartNumber}
          returnPrefix={returnPrefix} setReturnPrefix={setReturnPrefix}
          returnStartNumber={returnStartNumber} setReturnStartNumber={setReturnStartNumber}
          scrapPrefix={scrapPrefix} setScrapPrefix={setScrapPrefix}
          scrapStartNumber={scrapStartNumber} setScrapStartNumber={setScrapStartNumber}
          quotationPrefix={quotationPrefix} setQuotationPrefix={setQuotationPrefix}
          quotationStartNumber={quotationStartNumber} setQuotationStartNumber={setQuotationStartNumber}
          purchaseBillPrefix={purchaseBillPrefix} setPurchaseBillPrefix={setPurchaseBillPrefix}
          purchaseBillStartNumber={purchaseBillStartNumber} setPurchaseBillStartNumber={setPurchaseBillStartNumber}
        />
      );

    case 'billing':
      return (
        <BillingRulesTab featureFlags={featureFlags} onToggleFeature={handleToggleFeatureFlag}
          billingUIConfig={billingUIConfig} setBillingUIConfig={setBillingUIConfig}
          enableConvertToGst={enableConvertToGst} setEnableConvertToGst={setEnableConvertToGst}
          showPriceOverrideMrp={showPriceOverrideMrp} setShowPriceOverrideMrp={setShowPriceOverrideMrp}
        />
      );

    case 'cash':
      return (
        <CashDrawerSettingsTab
          autoOpenCashDrawer={autoOpenCashDrawer} setAutoOpenCashDrawer={setAutoOpenCashDrawer}
          autoCloseCashDrawer={autoCloseCashDrawer} setAutoCloseCashDrawer={setAutoCloseCashDrawer}
          autoCloseCashDrawerTime={autoCloseCashDrawerTime} setAutoCloseCashDrawerTime={setAutoCloseCashDrawerTime}
          defaultOpeningBalance={defaultOpeningBalance} setDefaultOpeningBalance={setDefaultOpeningBalance}
          openCashDrawerOnPending={openCashDrawerOnPending} setOpenCashDrawerOnPending={setOpenCashDrawerOnPending}
        />
      );

    case 'customers':
      return (
        <CustomersLoyaltyTab
          featureFlags={featureFlags}
          enablePartyEstimate={enablePartyEstimate} setEnablePartyEstimate={setEnablePartyEstimate}
          enablePartyGst={enablePartyGst} setEnablePartyGst={setEnablePartyGst}
          showFullyPaidCashInLedger={showFullyPaidCashInLedger} setShowFullyPaidCashInLedger={setShowFullyPaidCashInLedger}
          loyaltyAwardOnPending={loyaltyAwardOnPending} setLoyaltyAwardOnPending={setLoyaltyAwardOnPending}
          loyaltyIncludeTax={loyaltyIncludeTax} setLoyaltyIncludeTax={setLoyaltyIncludeTax} loyaltyEarningRate={loyaltyEarningRate} setLoyaltyEarningRate={setLoyaltyEarningRate}
          loyaltyRedemptionRate={loyaltyRedemptionRate} setLoyaltyRedemptionRate={setLoyaltyRedemptionRate}
          onOpenFeatures={() => setActiveSection('features')}
        />
      );

    case 'whatsapp':
    case 'whatsapp_device':
    case 'whatsapp_settings':
      return (
        <WhatsAppSettingsTab
          tenantId={tenantId as string | undefined}
          autoWhatsAppSend={autoWhatsAppSend}
          setAutoWhatsAppSend={setAutoWhatsAppSend}
          activeWhatsAppTab={activeWhatsAppTab}
          setActiveWhatsAppTab={setActiveWhatsAppTab}
          shopClosingConfig={shopClosingConfig}
          setShopClosingConfig={setShopClosingConfig}
        />
      );

    case 'hardware':
      return (
        <HardwareSettingsTab
          activeHardwareTab={activeHardwareTab}
          setActiveHardwareTab={setActiveHardwareTab}
          receiptPrinter={receiptPrinter}
          setReceiptPrinter={setReceiptPrinter}
          barcodePrinter={barcodePrinter}
          setBarcodePrinter={setBarcodePrinter}
          a4Printer={a4Printer}
          setA4Printer={setA4Printer}
          scale={scale}
          setScale={setScale}
          osPrinters={osPrinters}
          printersLoading={printersLoading}
          fetchPrinters={fetchPrinters}
          printWidth={printWidth}
          setPrintWidth={setPrintWidth}
        />
      );

    case 'products':
      return (
        <div className="space-y-6">
          <ProductsSettingsTab
            isAdminRole={isAdminRole(role)}
            activeProductsTab={activeProductsTab} setActiveProductsTab={setActiveProductsTab}
            priceCoding={priceCoding} setPriceCoding={setPriceCoding}
            serviceChargeBarcode={serviceChargeBarcode} setServiceChargeBarcode={setServiceChargeBarcode}
            enableRealPaperStock={enableRealPaperStock} setEnableRealPaperStock={setEnableRealPaperStock}
            showZeroPaperStock={showZeroPaperStock} setShowZeroPaperStock={setShowZeroPaperStock}
            showPaperStockInGst={showPaperStockInGst} setShowPaperStockInGst={setShowPaperStockInGst}
            showPaperStockInEstimate={showPaperStockInEstimate} setShowPaperStockInEstimate={setShowPaperStockInEstimate}
            showBulkSheet={showBulkSheet} setShowBulkSheet={setShowBulkSheet}
            showPaperOnlyProducts={showPaperOnlyProducts} setShowPaperOnlyProducts={setShowPaperOnlyProducts}
          />
          <InventoryDisplaySettings
            inventoryDefaultView={inventoryDefaultView} setInventoryDefaultView={setInventoryDefaultView}
            stockReportDefaultView={stockReportDefaultView} setStockReportDefaultView={setStockReportDefaultView}
            showPriceTiersInInventory={showPriceTiersInInventory} setShowPriceTiersInInventory={setShowPriceTiersInInventory}
            showProductGstBadge={showProductGstBadge} setShowProductGstBadge={setShowProductGstBadge}
          />
        </div>
      );

    case 'printing':
      return (
        <PrintingSettingsTab
          printFormat={printFormat} setPrintFormat={setPrintFormat}
          a5Orientation={a5Orientation} setA5Orientation={setA5Orientation}
          timeFormat={timeFormat} setTimeFormat={setTimeFormat}
          a4Style={a4Style} setA4Style={setA4Style}
          thermalStyle={thermalStyle} setThermalStyle={setThermalStyle}
          setPreviewStyle={setPreviewStyle}
          setPreviewFormat={setPreviewFormat}
          printWidth={printWidth}
          setActiveSection={setActiveSection}
        />
      );

    case 'print_options':
      return (
        <PrintOptionsSettingsTab
          billSettings={billSettings} setBillSettings={setBillSettings}
          receiptFont={receiptFont} setReceiptFont={setReceiptFont}
          scrapBillSettings={scrapBillSettings} setScrapBillSettings={setScrapBillSettings}
          showProductOffers={showProductOffers} setShowProductOffers={setShowProductOffers}
        />
      );

    case 'labels':
      return (
        <LabelSettingsTab
          autoPrintBarcode={autoPrintBarcode} setAutoPrintBarcode={setAutoPrintBarcode}
          labelCodeType={labelCodeType} setLabelCodeType={setLabelCodeType}
          labelShowShopName={labelShowShopName} setLabelShowShopName={setLabelShowShopName}
        />
      );

    case 'account':
      return (
        <AccountSecurityTab
          changingPass={changingPass} setPass={setPass} pass={pass}
          showOldPass={showOldPass} setShowOldPass={setShowOldPass}
          showNewPass={showNewPass} setShowNewPass={setShowNewPass}
          showConfirmPass={showConfirmPass} setShowConfirmPass={setShowConfirmPass}
          handleChangePassword={handleChangePassword}
        />
      );

    case 'system':
      return (
        <SystemPreferencesTab
          appVersion={appVersion}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          lastChecked={lastChecked}
          updateInfo={updateInfo}
          updateReady={updateReady}
          updateStatus={updateStatus}
          whatsNewLang={whatsNewLang} setWhatsNewLang={setWhatsNewLang}
          handleRetryDownload={handleRetryDownload}
          handleInstallUpdate={handleInstallUpdate}
        />
      );

    case 'restaurant':
      return <p className="text-sm text-muted-foreground">Manage tables on the Tables page and preparation stations on the Kitchen page. Food and extras are Inventory items.</p>;
    case 'features':
      return (
        <FeaturesTab onFlagsChange={onFlagsChange}
          featureFlags={featureFlags}
          handleToggleFeatureFlag={handleToggleFeatureFlag}
          setConfirmTurnOffAllModalOpen={setConfirmTurnOffAllModalOpen}
          setShowCashRegister={setShowCashRegister}
        />
      );

    case 'network':
      return (
        <NetworkSyncTab
          activeSection={activeSection}
          appVersion={appVersion}
          detectedLocalIp={detectedLocalIp}
          lanHostIp={lanHostIp} setLanHostIp={setLanHostIp}
          lanRole={lanRole} setLanRole={setLanRole}
          lanPort={lanPort}
          saving={saving}
          setActiveHardwareTab={setActiveHardwareTab}
          setActiveProductsTab={setActiveProductsTab}
          setActiveSection={setActiveSection}
          setShowBulkSheet={setShowBulkSheet}
          showBulkSheet={showBulkSheet}
          showLanHelpModal={showLanHelpModal} setShowLanHelpModal={setShowLanHelpModal}
          syncFrequency={syncFrequency} setSyncFrequency={setSyncFrequency}
          syncMode={syncMode} setSyncMode={setSyncMode}
          testingNetwork={testingNetwork} setTestingNetwork={setTestingNetwork}
          drainingQueue={drainingQueue} setDrainingQueue={setDrainingQueue}
          effectiveCloudState={effectiveCloudState} setEffectiveCloudState={setEffectiveCloudState}
          copiedFirewallCmd={copiedFirewallCmd} setCopiedFirewallCmd={setCopiedFirewallCmd}
          networkDetails={networkDetails} setNetworkDetails={setNetworkDetails}
          setMessage={setMessage}
        />
      );

    default:
      return null;
  }
}
