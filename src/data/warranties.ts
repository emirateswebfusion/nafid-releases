import { bindBridge } from './client';

/** Warranty records. Channel catalog — the only way UI code reaches these IPC channels. */
export const warrantiesApi = bindBridge({
  saveWarranty: 'dbSaveWarranty',
  getWarranties: 'dbGetWarranties',
  deleteWarranty: 'dbDeleteWarranty',
});
