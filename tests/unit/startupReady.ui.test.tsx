// @vitest-environment jsdom
import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ ready: vi.fn(async () => ({ success: true })), logError: vi.fn(), frames: [] as FrameRequestCallback[] }));
vi.mock('../../src/data/app', () => ({ appApi: { rendererReady: fixture.ready }, logError: fixture.logError }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
import { useStartupReady } from '../../src/components/app/hooks/useStartupReady';
beforeEach(() => { fixture.ready.mockClear(); fixture.logError.mockClear(); fixture.frames = []; vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => fixture.frames.push(fn)); vi.stubGlobal('cancelAnimationFrame', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('holds installer readiness until loading finishes and the initial view has painted', async () => {
  const hook = renderHook(({ ready }) => useStartupReady(ready), { initialProps: { ready: false } });
  expect(fixture.frames).toHaveLength(0); hook.rerender({ ready: true });
  expect(fixture.ready).not.toHaveBeenCalled(); fixture.frames.shift()?.(0);
  expect(fixture.ready).not.toHaveBeenCalled(); fixture.frames.shift()?.(16);
  expect(fixture.ready).toHaveBeenCalledOnce();
});
it('logs readiness IPC failures instead of silently hiding them', async () => {
  const error = new Error('IPC unavailable');
  fixture.ready.mockRejectedValueOnce(error);
  renderHook(() => useStartupReady(true));
  fixture.frames.shift()?.(0); fixture.frames.shift()?.(16);
  await Promise.resolve();
  expect(fixture.logError).toHaveBeenCalledWith('Could not notify installer that Nafid is ready', error);
});
