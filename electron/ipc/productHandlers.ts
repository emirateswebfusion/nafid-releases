import { handle } from './common.js';
import * as syncService from '../services/syncService.js';
import * as productsService from '../services/productsService.js';
import * as gradesService from '../services/gradesService.js';
import * as pricingTiersService from '../services/pricingTiersService.js';
import * as combosService from '../services/combosService.js';

export function registerProductHandlers(): void {
  handle('db:debugSyncState', syncService.debugSyncState);

  handle('db:getProducts', productsService.getProducts);

  handle('db:getProductsByIds', productsService.getProductsByIds);

  handle('db:getProductsCount', productsService.getProductsCount);

  handle('db:addProduct', productsService.addProduct, { safe: true });

  handle('db:ensureServiceItem', productsService.ensureServiceItem, { safe: true });

  handle('db:updateProduct', productsService.updateProduct, { safe: true });

  // Lightweight GST/Estimate toggle — flips only is_gst_applicable without touching
  // any other product field.
  handle('db:updateProductGstFlag', productsService.updateProductGstFlag, { safe: true });

  handle('db:updateProductName', productsService.updateProductName, { safe: true });

  handle('db:deleteProduct', productsService.deleteProduct);

  handle('db:bulkDeleteProducts', productsService.bulkDeleteProducts);

  handle('db:bulkImportProducts', productsService.bulkImportProducts, { safe: true });

  handle('db:updatePrintStatus', productsService.updatePrintStatus);

  handle('db:resetPrintStatus', productsService.resetPrintStatus);

  handle('db:getPendingPrintProducts', productsService.getPendingPrintProducts);

  handle('db:adjustStock', productsService.adjustStock);

  handle('db:getGrades', gradesService.getGrades);

  handle('db:addGrade', gradesService.addGrade, { safe: true });

  handle('db:updateGrade', gradesService.updateGrade, { safe: true });

  handle('db:deleteGrade', gradesService.deleteGrade);

  // ── Pricing Tier Handlers ───────────────────────────────────────────────────
  handle('db:getPricingTiers', pricingTiersService.getPricingTiers);

  handle('db:addPricingTier', pricingTiersService.addPricingTier, { safe: true });

  handle('db:updatePricingTier', pricingTiersService.updatePricingTier, { safe: true });

  handle('db:deletePricingTier', pricingTiersService.deletePricingTier);

  handle('db:reorderPricingTiers', pricingTiersService.reorderPricingTiers, { safe: true });

  handle('db:setDefaultPricingTier', pricingTiersService.setDefaultPricingTier, { safe: true });

  handle('db:getProductPricing', pricingTiersService.getProductPricing);

  // ── Combo Offers Handlers ──────────────────────────────────────────────────
  handle('db:getComboOffers', combosService.getComboOffers);

  handle('db:getComboOfferDetails', combosService.getComboOfferDetails);

  handle('db:saveComboOffer', combosService.saveComboOffer, { safe: true });

  handle('db:deleteComboOffer', combosService.deleteComboOffer);

  handle('db:toggleComboOfferActive', combosService.toggleComboOfferActive);

  // Upsert/delete per-tier prices for a single product
  // payload: { tenant_id, product_id, pricing: [{ pricing_tier_id, price }] }
  handle('db:setProductPricing', pricingTiersService.setProductPricing, { safe: true });

  // Bulk upsert/delete of product prices for one tier
  // payload: { tenant_id, pricing_tier_id, pricing: [{ product_id, price }] }
  handle('db:setTierPricing', pricingTiersService.setTierPricing, { safe: true });

}

