import React from 'react';
import { FileText, Package, Eye } from 'lucide-react';
import { DefaultStockReportViewSelector } from '../settingsConstants';
import { SettingsCard, ToggleRow } from '../views/SettingsControls';

export interface InventoryDisplaySettingsProps {
  inventoryDefaultView: string; setInventoryDefaultView: (v: string) => void;
  stockReportDefaultView: string; setStockReportDefaultView: (v: string) => void;
  showPriceTiersInInventory: boolean; setShowPriceTiersInInventory: (v: boolean) => void;
  showProductGstBadge: boolean; setShowProductGstBadge: (v: boolean) => void;
}

/** Default views and product-name badges for the inventory manager and stock report. */
export const InventoryDisplaySettings: React.FC<InventoryDisplaySettingsProps> = ({
  inventoryDefaultView, setInventoryDefaultView,
  stockReportDefaultView, setStockReportDefaultView,
  showPriceTiersInInventory, setShowPriceTiersInInventory,
  showProductGstBadge, setShowProductGstBadge,
}) => {
  return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SettingsCard icon={Package} title="Inventory Default View" subtitle="Which tab opens first in the inventory manager">
              <DefaultStockReportViewSelector value={inventoryDefaultView} onChange={setInventoryDefaultView} />
            </SettingsCard>
            <SettingsCard icon={FileText} title="Stock Report Default View" subtitle="Which tab opens first in the stock report">
              <DefaultStockReportViewSelector value={stockReportDefaultView} onChange={setStockReportDefaultView} />
            </SettingsCard>
            <div className="lg:col-span-2">
              <SettingsCard icon={Eye} title="Product Name Badges" subtitle="Small badges shown under each product name in the inventory list">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ToggleRow
                    label="Show GST / Estimate / Paper Badges"
                    description="Show or hide the product type badges (Real, Paper, Estimate, GST) under each product name."
                    checked={showProductGstBadge}
                    onToggle={() => setShowProductGstBadge(!showProductGstBadge)}
                  />
                  <ToggleRow
                    label="Show Price Tiers"
                    description="Show or hide pricing tier badges (Wholesale, Retail, Special Retail, etc.) under each product name."
                    checked={showPriceTiersInInventory}
                    onToggle={() => setShowPriceTiersInInventory(!showPriceTiersInInventory)}
                  />
                </div>
              </SettingsCard>
            </div>
          </div>
  );
};
