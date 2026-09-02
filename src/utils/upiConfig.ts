export interface UpiPageConfig {
  billing: boolean;
  settlement: boolean;
  sales_history: boolean;
  scrap: boolean;
  mobile_billing: boolean;
}

export const DEFAULT_UPI_PAGE_CONFIG: UpiPageConfig = {
  billing: true,
  settlement: true,
  sales_history: true,
  scrap: true,
  mobile_billing: true,
};

export async function getUpiPageConfig(tenantId?: string): Promise<UpiPageConfig> {
  try {
    if (window.electronAPI?.settingsGet) {
      const cfg = await window.electronAPI.settingsGet({
        tenant_id: tenantId || 'global',
        key: 'upi_page_config',
      });
      if (cfg && typeof cfg === 'object') {
        return {
          billing: cfg.billing !== undefined ? Boolean(cfg.billing) : true,
          settlement: cfg.settlement !== undefined ? Boolean(cfg.settlement) : true,
          sales_history: cfg.sales_history !== undefined ? Boolean(cfg.sales_history) : true,
          scrap: cfg.scrap !== undefined ? Boolean(cfg.scrap) : true,
          mobile_billing: cfg.mobile_billing !== undefined ? Boolean(cfg.mobile_billing) : true,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load UPI page config:', e);
  }
  return { ...DEFAULT_UPI_PAGE_CONFIG };
}

export async function saveUpiPageConfig(tenantId: string | undefined, config: UpiPageConfig): Promise<boolean> {
  try {
    if (window.electronAPI?.settingsSet) {
      const res = await window.electronAPI.settingsSet({
        tenant_id: tenantId || 'global',
        key: 'upi_page_config',
        value: config,
      });
      return !res || res.success !== false;
    }
  } catch (e) {
    console.error('Failed to save UPI page config:', e);
  }
  return false;
}
