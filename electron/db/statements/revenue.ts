/** Conversion copies are tax documents; only the original invoice represents a collection.
 * Keep tax-filing queries unfiltered. Aliases are a closed set, never user input.
 */
export function counterSalePredicate(alias: 'i' | '' = ''): string {
  const column = `${alias ? `${alias}.` : ''}converted_from_invoice_id`;
  return `(${column} IS NULL OR ${column} = '')`;
}

/** Revenue inclusion is stored on the invoice, independent of today's settings. */
export function countsInRevenue(alias: 'i' | '' = ''): string {
  return `${alias ? `${alias}.` : ''}counts_in_revenue = 1`;
}
