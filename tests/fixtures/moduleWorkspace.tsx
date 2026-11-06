/** Manual renderer fixture. In-memory test shop only; no native database or external network calls. */
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { flagsForBusinessProfile } from '../../src/config/businessProfiles';
import { useAuthStore } from '../../src/store/authStore';
const stored = JSON.parse(localStorage.getItem('nafid-module-fixture') || 'null') as Record<string, unknown> | null;
const settings: Record<string, unknown> = stored ?? {
  feature_flags: flagsForBusinessProfile('restaurant'), shop_name: 'Demo Cafeteria', store_country: 'AE', store_timezone: 'Asia/Dubai', vat_price_inclusive: true, shop_state: 'Abu Dhabi', terminal_code: 'A',
};
const setup = JSON.parse(localStorage.getItem('nafid-restaurant-fixture') || 'null') ?? { tables: [{ table_id: 't1', label: 'T1', area: 'Indoor', seats: 4, sort_order: 1, is_active: 1 }], stations: [], modifierGroups: [], modifiers: [] };
const bridge = new Proxy({}, { get: (_target, method: string) => {
  if (method.startsWith('on')) return () => () => {};
  return async (payload?: { key?: string; value?: unknown }) => {
    if (method === 'settingsGet') return settings[payload?.key || ''] ?? null;
    if (method === 'settingsGetAll') return settings;
    if (method === 'settingsSet' && payload?.key) { settings[payload.key] = payload.value; localStorage.setItem('nafid-module-fixture', JSON.stringify(settings)); return { success: true }; }
    if (method === 'appGetVersion') return '2.2.43-test';
    if (method === 'restaurantGetSetup') return setup;
    if (method === 'restaurantGetPrinterConfig') return settings.kitchen_printer_config ?? { widthMm: 80, stations: {} };
    if (method === 'restaurantSavePrinterConfig') { settings.kitchen_printer_config = payload; localStorage.setItem('nafid-module-fixture', JSON.stringify(settings)); return { success: true }; }
    if (method === 'restaurantSaveTable' || method === 'restaurantSaveStation') {
      const row = payload as Record<string, unknown>;
      const collection = method === 'restaurantSaveTable' ? 'tables' : 'stations';
      const id = collection === 'tables' ? 'table_id' : 'station_id';
      const rows = setup[collection] as Record<string, unknown>[];
      setup[collection] = [...rows.filter(x => x[id] !== row[id]), { ...row, ...(Array.isArray(row.categories) ? { categories: JSON.stringify(row.categories) } : {}) }];
      localStorage.setItem('nafid-restaurant-fixture', JSON.stringify(setup)); return { success: true };
    }
    if (method === 'restaurantListActive') return { orders: [], lines: [], kots: [], closedToday: [], terminal: 'A' };
    if (method === 'restaurantListKds') return { tickets: [], lines: [], tables: setup.tables };
    if (method === 'restaurantReport') return { byType: [], byWaiter: [], voids: [] };
    if (method === 'dbGetDashboardStats') return { success: true, totalSales: 0, totalInvoices: 0 };
    if (method === 'getSyncProgress') return { percent: 100, label: 'Ready' };
    if (method === 'dbGetProductsCount') return 0;
    if (method === 'dbGetInvoicesSummary') return { totalAmount: 0, totalCount: 0 };
    if (/Get|List|list|get/.test(method)) return [];
    return { success: true };
  };
} });
Object.defineProperty(window, 'electronAPI', { value: bridge, configurable: true });
window.fetch = async () => { throw new Error('External network disabled in renderer fixture'); };
useAuthStore.setState({ tenantId: 'module-test-shop', userId: 'test-owner', shopName: 'Demo Cafeteria', userName: 'Test owner', role: 'ADMIN', permissions: ['*'], isAuthenticated: true, isLoading: false, checkAuth: async () => {} });
const root = createRoot(document.getElementById('root')!);
if (new URLSearchParams(location.search).has('settings')) {
  const { SettingsManager } = await import('../../src/components/settings/SettingsManager');
  root.render(<SettingsManager onClose={() => { location.href = location.pathname; }} />);
} else {
  const { default: App } = await import('../../src/App');
  root.render(<App />);
}
