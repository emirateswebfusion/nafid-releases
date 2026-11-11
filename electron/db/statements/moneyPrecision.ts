/**
 * SQL for the number of fraction digits of a shop's currency: 3 for a Bahrain shop (BHD fils), otherwise 2.
 * Use it as the second argument of ROUND() on money so India and UAE keep two-decimal rounding.
 * Mirrors `storeMoneyDecimals` (electron/utils/moneyRounding.ts); settings values may be plain or JSON-quoted.
 * `tenantExpr` must be a trusted column reference of the surrounding statement (never user input).
 */
export function moneyDecimalsSql(tenantExpr: string): string {
  return `(SELECT CASE WHEN REPLACE(COALESCE(MAX(ms.value), ''), '"', '') = 'BH' THEN 3 ELSE 2 END FROM settings ms WHERE ms.tenant_id = ${tenantExpr} AND ms.key = 'store_country')`;
}
