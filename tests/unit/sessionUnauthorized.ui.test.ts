// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/store/authStore';
import { cloudFetch } from '../../src/data/cloud/client';

const prompt = vi.fn();
const denied = () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
beforeEach(() => {
  prompt.mockClear();
  useAuthStore.setState({ isAuthenticated: true, token: 'session-a', isCloudSyncPaused: false });
  window.addEventListener('open-session-expired-modal', prompt);
});
afterEach(() => {
  window.removeEventListener('open-session-expired-modal', prompt);
  vi.unstubAllGlobals();
});

it('prompts once for concurrent unauthorized requests and keeps local POS signed in', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => denied()));
  const results = await Promise.allSettled([cloudFetch('/ads'), cloudFetch('/settings'), cloudFetch('/ads')]);
  expect(results.every(result => result.status === 'rejected')).toBe(true);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, token: 'session-a', isCloudSyncPaused: true });
  await expect(cloudFetch('/ads')).rejects.toThrow('Unauthorized');
  expect(prompt).toHaveBeenCalledTimes(1);
  useAuthStore.setState({ token: 'session-b', isCloudSyncPaused: false });
  await expect(cloudFetch('/ads')).rejects.toThrow('Unauthorized');
  expect(prompt).toHaveBeenCalledTimes(2);
});

it.each(['session-b', null])('ignores an old rejection after the token changes to %s', async token => {
  let respond: (value: Response) => void = () => { throw new Error('Request not started'); };
  const fetch = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const pending = cloudFetch('/ads');
  const rejected = expect(pending).rejects.toThrow('Unauthorized');
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  useAuthStore.setState({ token, isCloudSyncPaused: false });
  respond(denied());
  await rejected;
  expect(prompt).not.toHaveBeenCalled();
  expect(useAuthStore.getState().isCloudSyncPaused).toBe(false);
});
