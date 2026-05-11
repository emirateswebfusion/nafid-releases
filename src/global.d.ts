export interface IElectronAPI {
  ping: () => Promise<string>;
  dbGetProducts: (tenantId: string) => Promise<any[]>;
  dbAddProduct: (product: any) => Promise<{ success: boolean; product_id?: string; error?: string }>;
  dbUpdateProduct: (product: any) => Promise<{ success: boolean; error?: string }>;
  dbDeleteProduct: (product_id: string) => Promise<{ success: boolean; error?: string }>;
  dbAdjustStock: (args: { product_id: string; delta: number }) => Promise<{ success: boolean; error?: string }>;
  dbCheckout: (payload: any) => Promise<{ success: boolean; invoice_id?: string; error?: string }>;
  dbGetInvoices: () => Promise<any[]>;
  dbGetInvoiceItems: (invoice_id: string) => Promise<any[]>;
  runInitialSync: () => Promise<{ success: boolean; error?: string }>;
  authSaveToken: (payload: { jwt_token: string; tenant_id: string; role: string; user_id: string; shop_name: string; domain_type?: string }) => Promise<{ success: boolean; error?: string }>;
  authGetToken: () => Promise<{ jwt_token: string; tenant_id: string; role: string; user_id: string; shop_name: string; domain_type?: string } | null>;
  authClearToken: () => Promise<{ success: boolean; error?: string }>;
  settingsGet: (payload: { tenant_id: string; key: string }) => Promise<any>;
  settingsSet: (payload: { tenant_id: string; key: string; value: any }) => Promise<{ success: boolean; error?: string }>;
  printReceipt: (data: string) => Promise<{ success: boolean; error?: string }>;
  openCashDrawer: () => Promise<{ success: boolean; error?: string }>;
  printBarcode: (barcode: string) => Promise<{ success: boolean; error?: string }>;
  onBarcodeScanned: (callback: (code: string) => void) => void;
  onScaleWeight: (callback: (weight: number) => void) => void;
  onSyncDataUpdated: (callback: () => void) => void;
  dbDebugDumpInvoices: () => Promise<{ success: boolean; rows?: any[]; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
