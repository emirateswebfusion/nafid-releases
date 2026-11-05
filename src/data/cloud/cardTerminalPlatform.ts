import { cloudFetch } from './client';

export interface PlatformCardConnection {
  provider: string;
  environment: 'TEST' | 'LIVE';
  endpoint: string;
  credentialsSaved: boolean;
  ready: boolean;
  status: 'SETUP_PENDING' | 'CONNECTOR_PENDING';
  message: string;
}

export const cardTerminalPlatform = {
  list: () => cloudFetch<PlatformCardConnection[]>('/api/card-terminal/platform'),
  save: (body: { provider: string; environment: 'TEST' | 'LIVE'; endpoint: string;
    credentials?: Record<string, string>; clearCredentials?: boolean }) =>
    cloudFetch<{ success: boolean; message: string }>('/api/card-terminal/platform', { method: 'PUT', body: JSON.stringify(body) }),
};
