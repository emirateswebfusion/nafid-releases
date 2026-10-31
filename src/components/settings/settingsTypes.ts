import type { KnownSettings, SettingsSnapshot } from '../../data/settings';
import type { printingApi } from '../../data/printing';
import type { Product } from '../../data/products';
import type { EffectiveCloudState } from '../../data/sync';
import type { SettingsFormState } from './hooks/useSettingsFormState';
import type { FeatureFlags } from '../../config/featureFlags';

/** Stored printer settings with connection fields edited by the hardware tab. */
export type PrinterConfig = KnownSettings['receipt_printer_config'] & {
  type?: string;
  ip?: string;
  port?: number | string;
  deviceName: string;
  labelWidthMm?: number | string;
  labelHeightMm?: number | string;
  labelColumns?: number | string;
  leftMarginOffsetMm?: number | string;
};
export type OsPrinterRow = Awaited<ReturnType<typeof printingApi.getPrinters>>[number];
export type ServiceChargeProductRow = Product;
export type CloudStateValue = EffectiveCloudState;
export type SettingsSnapshotObject = SettingsSnapshot;
export type SettingsSnapshotOverrides = Partial<SettingsFormState> & { featureFlags?: FeatureFlags | null };
