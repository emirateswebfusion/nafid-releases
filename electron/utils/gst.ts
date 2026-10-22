/** 1 when a product is GST-applicable: it has an HSN code or is explicitly flagged (default true). */
export const resolveGstApplicability = (gstFlag: unknown, hsnCode: unknown): number => {
  const hasHsnCode = String(hsnCode ?? '').trim() !== '';
  const isExplicitlyGst = gstFlag === undefined || gstFlag === null || gstFlag === true || gstFlag === 'true' || Number(gstFlag) === 1;
  return hasHsnCode || isExplicitlyGst ? 1 : 0;
};
