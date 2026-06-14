import { useAuthStore } from '../../src/store/authStore';

const BASE_URL = 'https://vendora-server.vercel.app';

function getAuthHeaders() {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

const mockElectronAPI = {
  // --- Auth & Token ---
  authGetToken: async () => {
    const raw = localStorage.getItem('vendora_auth_token');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  authSaveToken: async (payload: any) => {
    localStorage.setItem('vendora_auth_token', JSON.stringify(payload));
  },
  authClearToken: async () => {
    localStorage.removeItem('vendora_auth_token');
  },

  // --- Sync Data Updates ---
  onSyncDataUpdated: (_callback: () => void) => {
    // In a real web app we might use WebSockets or Polling.
    // For now, we just mock the listener.
  },

  // --- Invoices ---
  dbGetInvoices: async (filters: any) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());
    
    const res = await fetch(`${BASE_URL}/api/sync/invoices?${params.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch invoices');
    return res.json();
  },

  dbGetInvoiceItems: async (invoice_id: string) => {
    // The GET /api/sync/invoices endpoint actually returns items nested in the invoice.
    // Since SalesHistory expects a separate call, we can just return an empty array here 
    // and rely on the fact that we can modify SalesHistory slightly, OR we fetch all again and filter.
    // Wait, the POS app fetches items separately. The web backend returns `items` inside the invoice object.
    // For the polyfill, we can do a quick fetch of the invoice and return its items.
    const res = await fetch(`${BASE_URL}/api/sync/invoices?search=${invoice_id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data[0]?.items || [];
  },

  dbApplyInvoiceDiscount: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/api/invoices/discount`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true };
  },

  // --- Staff ---
  dbGetStaff: async (_tenant_id: string) => {
    const res = await fetch(`${BASE_URL}/auth/staff`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch staff');
    return res.json();
  },

  dbCreateStaff: async (staffData: any) => {
    const res = await fetch(`${BASE_URL}/auth/staff`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(staffData)
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true };
  },

  // --- Utilities ---
  printReceipt: async () => {
    console.warn('Printing is not supported on the web dashboard');
    alert('Printing is not supported on the web dashboard');
    return true;
  },
  
  settingsGet: async () => null,
  settingsSet: async () => true,

  // Stubs to prevent crashes
  onBarcodeScanned: () => {},
  onScaleWeight: () => {},
  dbGetProducts: async () => [],
};

// Inject it into the window object
(window as any).electronAPI = mockElectronAPI;
