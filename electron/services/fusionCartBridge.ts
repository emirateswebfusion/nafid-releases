/**
 * FusionCart Bridge Service (POS Side)
 * 
 * Handles POS <-> FusionCart external HTTP calls securely from the Electron backend.
 * FusionCart is an external service; this service handles registration, store profile,
 * product catalog synchronization, and orders inspection according to FusionCart's API contracts.
 */

export interface FusionCartVendorPayload {
  store_name: string;
  slug?: string;
  description?: string;
  city?: string;
  address?: string;
  pincode?: string;
  name: string;
  email: string;
  phone?: string | number;
}

export interface FusionCartProductPayload {
  name: string;
  slug?: string;
  short_description?: string;
  description?: string;
  type?: string;
  price: number;
  sale_price?: number;
  quantity: number;
  sku: string;
  store_id: number;
  status: number;
  is_approved?: number;
  stock_status?: 'in_stock' | 'out_of_stock';
}

export class FusionCartBridge {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5050/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(url: string) {
    if (url) {
      this.baseUrl = url.replace(/\/$/, '');
    }
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
      const headers = new Headers(options.headers || {});
      if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      headers.set('Accept', 'application/json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') || '';
      let resData: any = null;
      if (contentType.includes('application/json')) {
        resData = await res.json();
      } else {
        const text = await res.text();
        resData = { message: text };
      }

      if (!res.ok) {
        return {
          success: false,
          error: resData?.message || `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return {
        success: true,
        data: resData,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'FusionCart connection timed out after 10 seconds' };
      }
      return { success: false, error: err.message || 'Unable to connect to FusionCart server' };
    }
  }

  /**
   * Healthcheck / connection probe
   */
  async testConnection(): Promise<{ connected: boolean; message?: string }> {
    const res = await this.request('/store?paginate=1');
    if (res.success) {
      return { connected: true, message: 'Connection successful' };
    }
    return { connected: false, message: res.error };
  }

  /**
   * Register store / vendor on FusionCart
   */
  async registerVendor(payload: FusionCartVendorPayload): Promise<{ success: boolean; store?: any; error?: string }> {
    const slug = (payload.slug || payload.store_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const body = {
      store_name: payload.store_name,
      slug: slug || 'vendor-store',
      description: payload.description || `Store for ${payload.store_name}`,
      city: payload.city || '',
      address: payload.address || '',
      pincode: payload.pincode || '',
      hide_vendor_email: 0,
      hide_vendor_phone: 0,
      status: 1,
      is_approved: 0, // initially pending approval
      vendor: {
        name: payload.name,
        email: payload.email,
        phone: payload.phone || '',
        role: {
          id: 3,
          name: 'vendor',
        },
      },
    };

    const res = await this.request('/store', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.success) {
      return { success: false, error: res.error };
    }

    return { success: true, store: res.data };
  }

  /**
   * Retrieve vendor / store details by ID or Slug
   */
  async getStore(storeIdOrSlug: number | string): Promise<{ success: boolean; store?: any; error?: string }> {
    const res = await this.request(`/store/${encodeURIComponent(storeIdOrSlug)}`);
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return { success: true, store: res.data };
  }

  /**
   * Update online store settings
   */
  async updateStore(storeId: number | string, data: Partial<FusionCartVendorPayload>): Promise<{ success: boolean; store?: any; error?: string }> {
    const res = await this.request(`/store/${encodeURIComponent(storeId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return { success: true, store: res.data };
  }

  /**
   * Publish or update product on FusionCart
   */
  async syncProduct(fusionCartProductId: number | null, payload: FusionCartProductPayload): Promise<{ success: boolean; product?: any; error?: string }> {
    if (fusionCartProductId) {
      // Update existing
      const res = await this.request(`/product/${fusionCartProductId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return { success: true, product: res.data };
    } else {
      // Create new
      const res = await this.request('/product', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return { success: true, product: res.data };
    }
  }

  /**
   * Unpublish product (set status = 0 in FusionCart)
   */
  async unpublishProduct(fusionCartProductId: number): Promise<{ success: boolean; error?: string }> {
    const res = await this.request(`/product/${fusionCartProductId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 0 }),
    });
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return { success: true };
  }

  /**
   * Fetch online orders for this store
   */
  async getOrders(storeId: number): Promise<{ success: boolean; orders?: any[]; error?: string }> {
    const res = await this.request(`/order?store_id=${storeId}`);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    let list: any[] = [];
    if (Array.isArray(res.data)) {
      list = res.data;
    } else if (res.data && Array.isArray(res.data.data)) {
      list = res.data.data;
    }

    // Filter strictly by store_id
    const filtered = list.filter((order: any) => {
      const orderStoreId = order.store_id || order.store?.id;
      return orderStoreId == storeId;
    });

    return { success: true, orders: filtered };
  }
}
