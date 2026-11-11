/** Only the built-in tax-series prefix changes; custom prefixes and persisted invoice identities do not. */
export function profileInvoicePrefix(country: 'IN' | 'AE' | 'BH', configKey: string, prefix: string): string {
  return country !== 'IN' && configKey === 'gst_invoice_counter_config' && prefix === 'GST-' ? 'VAT-' : prefix;
}
