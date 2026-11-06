/** Product and variant draft discount edits share the same legacy conversion and clearing rules. */
export function changeProductDiscount(base: number, field: 'discount_percent' | 'discount_flat' | 'offer_price', value: string) {
  if (field === 'offer_price') return value === '' ? { offer_price: '' } : { offer_price: value, discount_percent: '', discount_flat: '' };
  if (value === '') return { discount_percent: '', discount_flat: '' };
  const amount = parseFloat(value);
  const paired = base && !isNaN(amount) ? (field === 'discount_percent' ? base * amount / 100 : amount / base * 100).toFixed(2) : '';
  return { [field]: value, [field === 'discount_percent' ? 'discount_flat' : 'discount_percent']: paired, offer_price: '' };
}

/** Reprice an existing percentage discount without changing offer/exclusivity state. */
export function recalculateProductDiscount(base: number, percent: string | number | null | undefined): { discount_flat?: string } {
  if (percent == null || percent === '' || isNaN(parseFloat(String(percent)))) return {};
  return { discount_flat: changeProductDiscount(base, 'discount_percent', String(percent)).discount_flat };
}
