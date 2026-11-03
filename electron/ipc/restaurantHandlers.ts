import { handle } from './common.js';
import * as setup from '../services/restaurantSetupService.js';
import * as orders from '../services/restaurantOrderService.js';
import * as kitchen from '../services/restaurantKitchenService.js';
import { claimForBilling } from '../services/restaurantClaim.js';

/** Restaurant mode channels (docs/architecture/restaurant-mode-design.md). Registration only. */
export function registerRestaurantHandlers(): void {
  handle('restaurant:getSetup', setup.getSetup);
  handle('restaurant:saveTable', setup.saveTable);
  handle('restaurant:deleteTable', setup.deleteTable);
  handle('restaurant:saveStation', setup.saveStation);
  handle('restaurant:deleteStation', setup.deleteStation);
  handle('restaurant:saveModifierGroup', setup.saveModifierGroup);
  handle('restaurant:deleteModifierGroup', setup.deleteModifierGroup);

  handle('restaurant:listActive', orders.listActive);
  handle('restaurant:getOrder', orders.getOrder);
  handle('restaurant:openOrder', orders.openOrder);
  handle('restaurant:updateOrder', orders.updateOrder);
  handle('restaurant:sendItems', orders.sendItems);
  handle('restaurant:voidLines', orders.voidLines);
  handle('restaurant:moveTable', orders.moveTable);
  handle('restaurant:mergeOrders', orders.mergeOrders);
  handle('restaurant:splitOrder', orders.splitOrder);
  handle('restaurant:cancelOrder', orders.cancelOrder);
  handle('restaurant:claimForBilling', claimForBilling);
  handle('restaurant:releaseClaim', orders.releaseClaim);

  handle('restaurant:printKots', kitchen.printKots);
  handle('restaurant:previewKot', kitchen.previewKot);
  handle('restaurant:getPrinterConfig', kitchen.getPrinterConfig);
  handle('restaurant:savePrinterConfig', kitchen.savePrinterConfig);
  handle('restaurant:testPrinter', kitchen.testPrinter);
  handle('restaurant:listKds', kitchen.listKds);
  handle('restaurant:setKdsStatus', kitchen.setKdsStatus);
  handle('restaurant:report', kitchen.report);
}
