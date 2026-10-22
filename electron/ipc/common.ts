import { ipcMain } from 'electron';
import log from 'electron-log/main';

/** IPC registration helpers. Handlers stay one-liners: `handle(channel, service.fn)`. */

export type IpcHandler<T, A extends unknown[]> = (event: Electron.IpcMainInvokeEvent, ...args: A) => T;

export function safeHandler<T, A extends unknown[]>(handler: IpcHandler<T, A>): IpcHandler<T, A> {
  return (event, ...args) => {
    try {
      return handler(event, ...args);
    } catch (err: any) {
      log.error(`[IPC] Validation error: ${err.message}`);
      throw err;
    }
  };
}

/**
 * Register an IPC channel that delegates to a service function (the event argument is dropped).
 * `safe: true` wraps it in safeHandler (logs validation errors before rethrowing).
 */
export function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R, opts: { safe?: boolean } = {}): void {
  const invoke: IpcHandler<R, A> = (_event, ...args) => fn(...args);
  ipcMain.handle(channel, opts.safe ? safeHandler(invoke) : invoke);
}
