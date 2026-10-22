/**
 * Product search WHERE fragment: every search word must match one of name, barcode, item code, brand, category or
 * HSN (also compared without spaces and via CLEAN_STR), OR the whole phrase matches, OR the product_id equals it.
 * Returns `{ sql, params }`; all values are bound parameters. Shared by product and purchase-bill lookups.
 */
export function buildProductSearchConditions(search: string, tablePrefix: string = 'p.') {
  const cleanSearch = String(search).trim();
  const wordTokens = cleanSearch.split(/[^\p{L}\p{N}]+/gu).filter(w => w.length > 0);
  const p = tablePrefix;

  const buildSingleFieldGroup = (val: string) => {
    const valNoSpace = val.replace(/\s+/g, '');
    const valClean = val.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const cleanPattern = valClean.length > 0 ? `%${valClean}%` : `%${val}%`;
    const sql = `(${p}name LIKE ? OR REPLACE(${p}name, ' ', '') LIKE ? OR CLEAN_STR(${p}name) LIKE ? OR ${p}sku_barcode LIKE ? OR REPLACE(${p}sku_barcode, ' ', '') LIKE ? OR CLEAN_STR(${p}sku_barcode) LIKE ? OR ${p}item_code LIKE ? OR REPLACE(${p}item_code, ' ', '') LIKE ? OR CLEAN_STR(${p}item_code) LIKE ? OR ${p}brand_manufacturer LIKE ? OR REPLACE(${p}brand_manufacturer, ' ', '') LIKE ? OR CLEAN_STR(${p}brand_manufacturer) LIKE ? OR ${p}category LIKE ? OR REPLACE(${p}category, ' ', '') LIKE ? OR CLEAN_STR(${p}category) LIKE ? OR ${p}hsn_sac_code LIKE ? OR CLEAN_STR(${p}hsn_sac_code) LIKE ?)`;
    const params = [
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, `%${valNoSpace}%`, cleanPattern,
      `%${val}%`, cleanPattern,
    ];
    return { sql, params };
  };

  const fullGroup = buildSingleFieldGroup(cleanSearch);

  if (wordTokens.length <= 1) {
    return {
      sql: `(${fullGroup.sql} OR ${p}product_id = ?)`,
      params: [...fullGroup.params, cleanSearch]
    };
  }

  const tokenClauses: string[] = [];
  const tokenParams: unknown[] = [];
  for (const token of wordTokens) {
    const tGroup = buildSingleFieldGroup(token);
    tokenClauses.push(tGroup.sql);
    tokenParams.push(...tGroup.params);
  }

  const sql = `((${tokenClauses.join(' AND ')}) OR ${fullGroup.sql} OR ${p}product_id = ?)`;
  const params = [...tokenParams, ...fullGroup.params, cleanSearch];

  return { sql, params };
}
