import { cloudFetch } from './client';

/** Cloud copy of sales (cloud `/sales`), used to preview bills synced from other terminals. */
export interface CloudSalesSearchResult {
  data?: unknown;
}

export const salesCloud = {
  search: (term: string) => cloudFetch<CloudSalesSearchResult>(`/sales?search=${encodeURIComponent(term)}`),
  items: (invoiceId: string) => cloudFetch<unknown>(`/sales/${invoiceId}/items`),
};
