import { localizeCurrencyText } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Receipt, Shield } from 'lucide-react';
import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { useBillingUIStore } from '../../../store/billingUIStore';
import { SettingsCard, ToggleRow } from '../views/SettingsControls';
import type { SettingsForm } from '../settingsFormTypes';

export interface BillingRulesTabProps {
  billingUIConfig: SettingsForm['billingUIConfig']; setBillingUIConfig: SettingsForm['setBillingUIConfig'];
  enableConvertToGst: boolean; setEnableConvertToGst: (v: boolean) => void;
  showPriceOverrideMrp: boolean; setShowPriceOverrideMrp: (v: boolean) => void;
}

/** Billing Rules: price override display on the billing page and billing security / staff options. */
export const BillingRulesTab: React.FC<BillingRulesTabProps> = ({
  billingUIConfig, setBillingUIConfig,
  enableConvertToGst, setEnableConvertToGst,
  showPriceOverrideMrp, setShowPriceOverrideMrp,
}) => {
  const { flags: featureFlags } = useFeatureFlagsStore();
  const toggleFlag = (key: 'biller_pin' | 'sales_staff' | 'staff_credit_billing') =>
    useFeatureFlagsStore.getState().setFlag(key, !featureFlags?.[key]);
  const togglePurchasePrice = () => {
    const updated = { ...billingUIConfig, showPurchasePriceInPOS: !billingUIConfig.showPurchasePriceInPOS };
    setBillingUIConfig(updated);
    useBillingUIStore.getState().updateConfig(updated);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SettingsCard icon={Receipt} title="Price Override" subtitle="What the cashier sees when changing a price on the billing page">
        <div className="space-y-3.5">
          <ToggleRow
            label="Show Old MRP on Price Overrides (Billing Page)"
            description={localizeCurrencyText("Show the original MRP when the unit price is manually overridden or discounted on the billing page (e.g. MRP ₹100 → Overridden ₹80).")}
            checked={showPriceOverrideMrp}
            onToggle={() => setShowPriceOverrideMrp(!showPriceOverrideMrp)}
          />
          <ToggleRow
            label="Show Product Purchase Cost in Price Override Menu (View-Only)"
            description="Show the product's cost / purchase price in the Price Override & Tier dropdown for reference (view only, not selectable)."
            checked={Boolean(billingUIConfig.showPurchasePriceInPOS)}
            onToggle={togglePurchasePrice}
          />
        </div>
      </SettingsCard>

      <SettingsCard icon={Shield} title="Billing Security & Staff">
        <div className="space-y-3.5">
          <ToggleRow
            label="Biller PIN Protection"
            description="Require a security PIN before switching biller or completing billing actions."
            checked={Boolean(featureFlags?.biller_pin)}
            onToggle={() => toggleFlag('biller_pin')}
          />
          <ToggleRow
            label="Sales Staff Tracking"
            description="Track the sales staff on each invoice for performance and commission reporting."
            checked={Boolean(featureFlags?.sales_staff)}
            onToggle={() => toggleFlag('sales_staff')}
          />
          <ToggleRow
            label="Show Staff in Customer Search & Credit Ledger"
            description="Show staff in billing customer search. Credit sales to staff automatically update their staff ledger without creating duplicate customer parties."
            checked={Boolean(featureFlags?.staff_credit_billing)}
            onToggle={() => toggleFlag('staff_credit_billing')}
          />
          <ToggleRow
            label="Convert to GST in Sales History"
            description='Show the "Convert to GST" button in Sales History to convert Bill of Supply invoices to GST invoices.'
            checked={enableConvertToGst}
            onToggle={() => setEnableConvertToGst(!enableConvertToGst)}
          />
        </div>
      </SettingsCard>
    </div>
  );
};
