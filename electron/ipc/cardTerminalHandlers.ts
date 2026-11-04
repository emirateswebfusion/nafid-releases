import { handle } from './common.js';
import * as cardTerminalService from '../services/cardTerminalService.js';

export function registerCardTerminalHandlers(): void {
  handle('cardTerminal:getStatus', cardTerminalService.getStatus);
  handle('cardTerminal:sale', cardTerminalService.sale);
  handle('cardTerminal:void', cardTerminalService.voidSale);
  handle('cardTerminal:refund', cardTerminalService.refund);
  handle('cardTerminal:cancel', cardTerminalService.cancel);
  handle('cardTerminal:resolve', cardTerminalService.resolve);
  handle('cardTerminal:test', cardTerminalService.testConnection);
  handle('cardTerminal:billSplitDetails', cardTerminalService.billSplitDetails);
  handle('cardTerminal:listPorts', cardTerminalService.listPorts);
  handle('cardTerminal:listTransactions', cardTerminalService.listTransactions);
  handle('cardTerminal:listUnresolved', cardTerminalService.listUnresolved);
}
