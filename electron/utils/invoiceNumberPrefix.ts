/** Only the built-in tax-series prefix changes; custom prefixes and persisted invoice identities do not. */
export function profileInvoicePrefix(country: 'IN' | 'AE', configKey: string, prefix: string): string {
  return country === 'AE' && configKey === 'gst_invoice_counter_config' && prefix === 'GST-' ? 'VAT-' : prefix;
}
