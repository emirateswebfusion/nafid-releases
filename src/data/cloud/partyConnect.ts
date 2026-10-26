import { cloudFetch } from './client';

/** Shop connect codes and ledger connection requests between shops (cloud `/settings/connect-code`, `/parties/connect`). */
export interface ConnectCodeResult {
  connect_code?: string;
}

export interface ConnectSearchResult {
  name?: string;
  connect_code?: string;
  [key: string]: unknown;
}

export const partyConnectCloud = {
  getConnectCode: () => cloudFetch<ConnectCodeResult | null>('/settings/connect-code'),
  requests: () => cloudFetch<unknown>('/parties/connect/requests'),
  search: (query: string) => cloudFetch<ConnectSearchResult | null>('/parties/connect/search', { method: 'POST', body: JSON.stringify({ query }) }),
  request: (body: { receiver_connect_code: unknown; party_name: unknown }) =>
    cloudFetch('/parties/connect/request', { method: 'POST', body: JSON.stringify(body) }),
  respond: (requestId: string, action: string) =>
    cloudFetch('/parties/connect/respond', { method: 'POST', body: JSON.stringify({ request_id: requestId, action }) }),
};
