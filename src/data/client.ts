/**
 * The only module allowed to reach the Electron bridge.
 *
 * Repositories in `src/data/*` call `api()`. UI code never does.
 * Keeping the lookup dynamic makes the web build fail loudly instead of
 * silently reading `undefined.someMethod`.
 */

export type ElectronApi = Window['electronAPI'];

class IpcUnavailableError extends Error {
  constructor() {
    super('Electron bridge is unavailable. Data access must run inside the desktop app.');
    this.name = 'IpcUnavailableError';
  }
}

export function api(): ElectronApi {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new IpcUnavailableError();
  }
  return window.electronAPI;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

export interface WriteResult {
  success: boolean;
  error?: string;
}

export function ensureSuccess(
  result: { success: boolean; error?: string } | null | undefined,
  action: string,
): void {
  if (!result || result.success !== true) {
    throw new Error(result?.error || `${action} failed`);
  }
}

type BridgeChannel = keyof ElectronApi;
type BoundApi<M extends Record<string, BridgeChannel>> = { [K in keyof M]: NonNullable<ElectronApi[M[K]]> };

/** True when the bridge exposes `channel` (for features that older desktop builds lack). */
export function hasBridge(channel: BridgeChannel): boolean {
  return isDesktopRuntime() && typeof window.electronAPI[channel] === 'function';
}

/**
 * Builds a domain repository from bridge channels: `{ alias: 'channelName' }`.
 * Each function keeps the exact signature declared in `src/global.d.ts` and resolves the bridge
 * lazily, so a missing bridge fails loudly at call time (IpcUnavailableError).
 */
export function bindBridge<M extends Record<string, BridgeChannel>>(channels: M): BoundApi<M> {
  const bound: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [alias, channel] of Object.entries(channels)) {
    bound[alias] = (...args: unknown[]) => (api()[channel] as (...a: unknown[]) => unknown)(...args);
  }
  return bound as BoundApi<M>;
}

/**
 * Like `bindBridge` for push subscriptions (`onX(callback) => unsubscribe`). Outside the
 * desktop runtime, or when the channel is missing, subscribing is a no-op.
 */
export function bindEvents<M extends Record<string, BridgeChannel>>(channels: M): BoundApi<M> {
  const bound: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [alias, channel] of Object.entries(channels)) {
    bound[alias] = (...args: unknown[]) => {
      if (!hasBridge(channel)) return () => undefined;
      return (window.electronAPI[channel] as (...a: unknown[]) => unknown)(...args);
    };
  }
  return bound as BoundApi<M>;
}
