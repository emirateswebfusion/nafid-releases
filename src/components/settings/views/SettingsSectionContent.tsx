import React from 'react';
import { EmergencyPurgeSettings } from '../EmergencyPurgeSettings';
import { StaffDataMaskingSettings } from '../StaffDataMaskingSettings';
import { DesignSettings } from '../../design-settings/DesignSettings';
import { LedgerTerminologySettings } from '../LedgerTerminologySettings';
import { BillingUICustomizer } from '../../billing-ui-customizer/BillingUICustomizer';
import { useBillingUIStore } from '../../../store/billingUIStore';
import { DashboardCardCustomizer } from '../../owner-dashboard/DashboardCardCustomizer';
import { StoreSettingsTab } from '../tabs/StoreSettingsTab';
import { WhatsAppSettingsTab } from '../tabs/WhatsAppSettingsTab';
import { HardwareSettingsTab } from '../tabs/HardwareSettingsTab';
import { ProductsSettingsTab } from '../tabs/ProductsSettingsTab';
import { isAdminRole } from '../../../utils/permissions';
import { PrintingSettingsTab } from '../tabs/PrintingSettingsTab';
import { PrintOptionsSettingsTab } from '../tabs/PrintOptionsSettingsTab';
import { SystemPreferencesTab } from '../tabs/SystemPreferencesTab';
import { FeaturesTab } from '../tabs/FeaturesTab';
import { NetworkSyncTab } from '../tabs/NetworkSyncTab';
import type { FeatureFlags, FeatureKey } from '../../../config/featureFlags';
import type { SettingsFormState } from '../hooks/useSettingsFormState';

export interface SettingsSectionContentProps {
  activeSection: string;
  featureFlags: FeatureFlags | null;
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
  activeSection, featureFlags, fetchPrinters, handleChangePassword, handleInstallUpdate, handleRetryDownload,
  handleToggleFeatureFlag, returnPrefix, returnStartNumber, role, sectionId, setActiveSection, tenantId, form,
}: SettingsSectionContentProps) {
  const { a4Printer, a4Style, a5Orientation, activeHardwareTab, activeProductsTab, activeWhatsAppTab, appVersion, autoCloseCashDrawer, autoCloseCashDrawerTime, autoOpenCashDrawer, autoPrintBarcode, autoWhatsAppSend, b2bPrefix, b2bStartNumber, b2cPrefix, b2cStartNumber, bankAccount, bankBranch, bankIfsc, bankName, barcodePrinter, billingUIConfig, billSettings, changingPass, confirmTurnOffAllModalOpen, connectCode, copiedCode, copiedFirewallCmd, defaultOpeningBalance, detectedLocalIp, downloadProgress, drainingQueue, effectiveCloudState, emergencyPanicConfig, enableConvertToGst, enablePartyEstimate, enablePartyGst, enableRealPaperStock, enableScrap, enableThreeInvoiceSeries, gstConversionTaxInclusive, gstProfitPercentage, inventoryDefaultView, invoiceStartNumber, isDownloading, labelCodeType, labelShowShopName, lanHostIp, lanPort, lanRole, lastChecked, loading, loyaltyAwardOnPending, loyaltyEarningRate, loyaltyEnabled, loyaltyRedemptionRate, networkDetails, openCashDrawerOnPending, osPrinters, pass, previewFormat, previewStyle, priceCoding, printersLoading, printFormat, printWidth, purchaseBillPrefix, purchaseBillStartNumber, quotationPrefix, quotationStartNumber, receiptFont, receiptPrinter, saving, scale, scrapBillSettings, scrapPrefix, scrapStartNumber, serviceChargeBarcode, setA4Printer, setA4Style, setA5Orientation, setActiveHardwareTab, setActiveProductsTab, setActiveWhatsAppTab, setAutoCloseCashDrawer, setAutoCloseCashDrawerTime, setAutoOpenCashDrawer, setAutoPrintBarcode, setAutoWhatsAppSend, setB2bPrefix, setB2bStartNumber, setB2cPrefix, setB2cStartNumber, setBankAccount, setBankBranch, setBankIfsc, setBankName, setBarcodePrinter, setBillingUIConfig, setBillSettings, setConfirmTurnOffAllModalOpen, setCopiedCode, setCopiedFirewallCmd, setDefaultOpeningBalance, setDrainingQueue, setEffectiveCloudState, setEmergencyPanicConfig, setEnableConvertToGst, setEnablePartyEstimate, setEnablePartyGst, setEnableRealPaperStock, setEnableScrap, setEnableThreeInvoiceSeries, setGstConversionTaxInclusive, setGstProfitPercentage, setInventoryDefaultView, setInvoiceStartNumber, setLabelCodeType, setLabelShowShopName, setLanHostIp, setLanRole, setLoyaltyAwardOnPending, setLoyaltyEarningRate, setLoyaltyEnabled, setLoyaltyRedemptionRate, setMessage, setNetworkDetails, setOpenCashDrawerOnPending, setPass, setPreviewFormat, setPreviewStyle, setPriceCoding, setPrintFormat, setPrintWidth, setPurchaseBillPrefix, setPurchaseBillStartNumber, setQuotationPrefix, setQuotationStartNumber, setReceiptFont, setReceiptPrinter, setReturnPrefix, setReturnStartNumber, setScale, setScrapBillSettings, setScrapPrefix, setScrapStartNumber, setServiceChargeBarcode, setShopAddress, setShopClosingConfig, setShopEmail, setShopGstin, setShopNameLocal, setShopPhone, setShopState, setShopWebsite, setShowBulkSheet, setShowCashRegister, setShowConfirmPass, setShowFullyPaidCashInLedger, setShowLanHelpModal, setShowNewPass, setShowOldPass, setShowPaperOnlyProducts, setShowPaperStockInEstimate, setShowPaperStockInGst, setShowPriceOverrideMrp, setShowPriceTiersInInventory, setShowProductGstBadge, setShowProductOffers, setShowUpiQr, setShowZeroPaperStock, setStaffDataMaskingConfig, setStockReportDefaultView, setStoreTimezoneState, setSyncFrequency, setSyncMode, setTerminalCode, setTestingNetwork, setThermalStyle, setTimeFormat, setUpiId, setWhatsNewLang, shopAddress, shopClosingConfig, shopEmail, shopGstin, shopNameLocal, shopPhone, shopState, shopWebsite, showBulkSheet, showCashRegister, showConfirmPass, showFullyPaidCashInLedger, showLanHelpModal, showNewPass, showOldPass, showPaperOnlyProducts, showPaperStockInEstimate, showPaperStockInGst, showPriceOverrideMrp, showPriceTiersInInventory, showProductGstBadge, showProductOffers, showUpiQr, showZeroPaperStock, staffDataMaskingConfig, stockReportDefaultView, storeTimezone, syncFrequency, syncMode, terminalCode, testingNetwork, thermalStyle, timeFormat, updateInfo, updateReady, updateStatus, upiId, whatsNewLang } = form;

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
            useBillingUIStore.getState().updateConfig(newCfg);
          }}
        />
      );
    case 'dashboard_cards':
      return (
        <div className="space-y-6 animate-in fade-in duration-300 w-full pb-12">
          <DashboardCardCustomizer />
        </div>
      );
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
          shopGstin={shopGstin} setShopGstin={setShopGstin}
          shopState={shopState} setShopState={setShopState}
          gstProfitPercentage={gstProfitPercentage} setGstProfitPercentage={setGstProfitPercentage}
          gstConversionTaxInclusive={gstConversionTaxInclusive} setGstConversionTaxInclusive={setGstConversionTaxInclusive}
          storeTimezone={storeTimezone} setStoreTimezoneState={setStoreTimezoneState}
          bankName={bankName} setBankName={setBankName}
          bankAccount={bankAccount} setBankAccount={setBankAccount}
          bankIfsc={bankIfsc} setBankIfsc={setBankIfsc}
          bankBranch={bankBranch} setBankBranch={setBankBranch}
          upiId={upiId} setUpiId={setUpiId}
          showUpiQr={showUpiQr} setShowUpiQr={setShowUpiQr}
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
        <ProductsSettingsTab
          isAdminRole={isAdminRole(role)}
          activeProductsTab={activeProductsTab} setActiveProductsTab={setActiveProductsTab}
          priceCoding={priceCoding} setPriceCoding={setPriceCoding}
          serviceChargeBarcode={serviceChargeBarcode} setServiceChargeBarcode={setServiceChargeBarcode}
          enableRealPaperStock={enableRealPaperStock} setEnableRealPaperStock={setEnableRealPaperStock}
          showZeroPaperStock={showZeroPaperStock} setShowZeroPaperStock={setShowZeroPaperStock}
          showPaperStockInGst={showPaperStockInGst} setShowPaperStockInGst={setShowPaperStockInGst}
          showPaperStockInEstimate={showPaperStockInEstimate} setShowPaperStockInEstimate={setShowPaperStockInEstimate}
          showProductGstBadge={showProductGstBadge} setShowProductGstBadge={setShowProductGstBadge}
          showBulkSheet={showBulkSheet} setShowBulkSheet={setShowBulkSheet}
          showPaperOnlyProducts={showPaperOnlyProducts} setShowPaperOnlyProducts={setShowPaperOnlyProducts}
        />
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
          autoOpenCashDrawer={autoOpenCashDrawer} setAutoOpenCashDrawer={setAutoOpenCashDrawer}
          autoCloseCashDrawer={autoCloseCashDrawer} setAutoCloseCashDrawer={setAutoCloseCashDrawer}
          autoCloseCashDrawerTime={autoCloseCashDrawerTime} setAutoCloseCashDrawerTime={setAutoCloseCashDrawerTime}
          autoPrintBarcode={autoPrintBarcode} setAutoPrintBarcode={setAutoPrintBarcode}
          billSettings={billSettings} setBillSettings={setBillSettings}
          billingUIConfig={billingUIConfig} setBillingUIConfig={setBillingUIConfig}
          defaultOpeningBalance={defaultOpeningBalance} setDefaultOpeningBalance={setDefaultOpeningBalance}
          enableConvertToGst={enableConvertToGst} setEnableConvertToGst={setEnableConvertToGst}
          labelCodeType={labelCodeType} setLabelCodeType={setLabelCodeType}
          labelShowShopName={labelShowShopName} setLabelShowShopName={setLabelShowShopName}
          openCashDrawerOnPending={openCashDrawerOnPending} setOpenCashDrawerOnPending={setOpenCashDrawerOnPending}
          receiptFont={receiptFont} setReceiptFont={setReceiptFont}
          scrapBillSettings={scrapBillSettings} setScrapBillSettings={setScrapBillSettings}
          showFullyPaidCashInLedger={showFullyPaidCashInLedger} setShowFullyPaidCashInLedger={setShowFullyPaidCashInLedger}
          showPriceOverrideMrp={showPriceOverrideMrp} setShowPriceOverrideMrp={setShowPriceOverrideMrp}
          showProductOffers={showProductOffers} setShowProductOffers={setShowProductOffers}
          loyaltyEnabled={loyaltyEnabled} setLoyaltyEnabled={setLoyaltyEnabled}
          loyaltyEarningRate={loyaltyEarningRate} setLoyaltyEarningRate={setLoyaltyEarningRate}
          loyaltyRedemptionRate={loyaltyRedemptionRate} setLoyaltyRedemptionRate={setLoyaltyRedemptionRate}
          loyaltyAwardOnPending={loyaltyAwardOnPending} setLoyaltyAwardOnPending={setLoyaltyAwardOnPending}
          enableScrap={enableScrap} setEnableScrap={setEnableScrap}
          previewFormat={previewFormat} setPreviewFormat={setPreviewFormat}
          previewStyle={previewStyle} setPreviewStyle={setPreviewStyle}
        />
      );

    case 'system':
      return (
        <SystemPreferencesTab
          appVersion={appVersion}
          changingPass={changingPass} setPass={setPass} pass={pass}
          showOldPass={showOldPass} setShowOldPass={setShowOldPass}
          showNewPass={showNewPass} setShowNewPass={setShowNewPass}
          showConfirmPass={showConfirmPass} setShowConfirmPass={setShowConfirmPass}
          inventoryDefaultView={inventoryDefaultView} setInventoryDefaultView={setInventoryDefaultView}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          lastChecked={lastChecked}
          loading={loading}
          stockReportDefaultView={stockReportDefaultView} setStockReportDefaultView={setStockReportDefaultView}
          showPriceTiersInInventory={showPriceTiersInInventory} setShowPriceTiersInInventory={setShowPriceTiersInInventory}
          showProductGstBadge={showProductGstBadge} setShowProductGstBadge={setShowProductGstBadge}
          updateInfo={updateInfo}
          updateReady={updateReady}
          updateStatus={updateStatus}
          whatsNewLang={whatsNewLang} setWhatsNewLang={setWhatsNewLang}
          setActiveSection={setActiveSection}
          handleChangePassword={handleChangePassword}
          handleRetryDownload={handleRetryDownload}
          handleInstallUpdate={handleInstallUpdate}
        />
      );

    case 'features':
      return (
        <FeaturesTab
          featureFlags={featureFlags}
          handleToggleFeatureFlag={handleToggleFeatureFlag}
          enablePartyEstimate={enablePartyEstimate} setEnablePartyEstimate={setEnablePartyEstimate}
          enablePartyGst={enablePartyGst} setEnablePartyGst={setEnablePartyGst}
          loyaltyAwardOnPending={loyaltyAwardOnPending} setLoyaltyAwardOnPending={setLoyaltyAwardOnPending}
          loyaltyEarningRate={loyaltyEarningRate} setLoyaltyEarningRate={setLoyaltyEarningRate}
          loyaltyRedemptionRate={loyaltyRedemptionRate} setLoyaltyRedemptionRate={setLoyaltyRedemptionRate}
          saving={saving}
          confirmTurnOffAllModalOpen={confirmTurnOffAllModalOpen} setConfirmTurnOffAllModalOpen={setConfirmTurnOffAllModalOpen}
          showCashRegister={showCashRegister} setShowCashRegister={setShowCashRegister}
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
