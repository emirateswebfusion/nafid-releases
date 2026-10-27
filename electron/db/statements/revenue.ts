/** Conversion copies are tax documents; only the original invoice represents a collection.
 * Keep tax-filing queries unfiltered. Aliases are a closed set, never user input.
 */
export function counterSalePredicate(alias: 'i' | '' = ''): string {
  const column = `${alias ? `${alias}.` : ''}converted_from_invoice_id`;
  return `(${column} IS NULL OR ${column} = '')`;
}
