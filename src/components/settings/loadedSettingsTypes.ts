import type { KnownSettings, PrintFormatSettings } from '../../data/settings';
import type { BillingUIConfig } from '../../store/billingUIStore';
import type { SettingsFormState } from './hooks/useSettingsFormState';

type Counter = { counter?: number | string; prefix?: string };
type Printer = Record<string, unknown> & { deviceName: string };

/** Stored settings consumed by the loader; absent settings retain its existing defaults. */
export type LoadedSettings = Partial<Omit<KnownSettings, 'print_format' | 'network_sync_config' | 'price_coding' | 'bank_name' | 'bank_account_number' | 'bank_account' | 'bank_ifsc' | 'bank_branch'>> & Record<string, unknown> & {
  bank_name?: string | { value?: string };
  bank_account_number?: string | { value?: string };
  bank_account?: string | { value?: string };
  bank_ifsc?: string | { value?: string };
  bank_branch?: string | { value?: string };
  terminal_code?: string | { value?: string; code?: string };
  store_timezone?: string | { timezone?: string };
  default_opening_balance?: number | string;
  barcode_printer_config?: Printer;
  a4_printer_config?: Printer;
  printer_config?: Printer;
  scale_config?: SettingsFormState['scale'];
  price_coding?: SettingsFormState['priceCoding'];
  print_format?: PrintFormatSettings & { thermalStyle?: SettingsFormState['thermalStyle']; a4Style?: SettingsFormState['a4Style']; a5Orientation?: SettingsFormState['a5Orientation'] };
  network_sync_config?: Omit<KnownSettings['network_sync_config'], 'syncFrequency'> & { syncFrequency?: SettingsFormState['syncFrequency'] };
  invoice_counter_config?: Counter;
  return_counter?: Counter;
  scrap_invoice_counter?: Counter;
  quotation_counter?: Counter;
  purchase_bill_counter?: Counter;
  three_invoice_series?: { enabled?: boolean; b2bPrefix?: string; b2bStartNumber?: string | number; b2cPrefix?: string; b2cStartNumber?: string | number };
  dual_invoice_series?: { enabled?: boolean; gstTerminalCode?: string; gstStartNumber?: string | number };
  billing_ui_config?: Partial<BillingUIConfig>;
};
