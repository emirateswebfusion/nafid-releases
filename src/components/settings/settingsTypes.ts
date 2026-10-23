/**
 * Loose values of the settings screen: printer configs (shape grows with the printer type), the OS printer list, the
 * service-charge product, the cloud state and the settings snapshot used for change detection. They are untyped here, in one
 * place, until the screen is typed; use these aliases instead of writing `any` in settings code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy printer config, typed later in one place
export type PrinterConfig = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy OS printer entry, typed later in one place
export type OsPrinterRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy service charge product row, typed later in one place
export type ServiceChargeProductRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy cloud state, typed later in one place
export type CloudStateValue = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy settings snapshot object, typed later in one place
export type SettingsSnapshotObject = any;
export type SettingsSnapshotOverrides = Record<string, SettingsSnapshotObject>;
