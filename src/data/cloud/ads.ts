import { cloudFetch } from './client';

/** Advertisements published to the customer mobile app (cloud `/ads`). */
export interface CloudAdCreateResult {
  ad_id?: string;
  error?: string;
}

export const adsCloud = {
  myAds: () => cloudFetch<unknown>('/ads/my-ads'),
  create: (ad: Record<string, unknown>) => cloudFetch<CloudAdCreateResult | null>('/ads', { method: 'POST', body: JSON.stringify(ad) }),
  setStatus: (adId: string, status: string) => cloudFetch(`/ads/${adId}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  remove: (adId: string) => cloudFetch(`/ads/${adId}`, { method: 'DELETE' }),
};
