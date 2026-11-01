import { bindBridge } from './client';

/** Renderer-side API for GST reports and compliance filings. All data flows through this module. */
export const gstApi = bindBridge({
  getGstReport: 'dbGetGstReport',
  getLocalGstFilings: 'dbGetLocalGstFilings',
  upsertLocalGstFiling: 'dbUpsertLocalGstFiling',
  recordLocalManualAcknowledgement: 'dbRecordLocalManualAcknowledgement',
});
