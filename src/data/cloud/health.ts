import { cloudRequest } from './client';

/** Health checks for the LAN master server and the cloud API. Returns the raw response. */
export const healthCloud = {
  check(baseUrl: string, timeoutMs: number): Promise<Response> {
    return cloudRequest(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
  },
};
