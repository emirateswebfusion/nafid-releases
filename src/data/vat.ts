import { bindBridge } from './client';

/** Renderer-side API for UAE VAT Return 201 & FTA Audit reports. All data flows through this module. */
export const vatApi = bindBridge({
  getVatReport: 'dbGetVatReport',
  getLocalVatFilings: 'dbGetLocalVatFilings',
  upsertLocalVatFiling: 'dbUpsertLocalVatFiling',
  recordLocalVatManualAck: 'dbRecordLocalVatManualAck',
});

