// @vitest-environment jsdom
import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ ready: vi.fn(async () => ({ success: true })), frames: [] as FrameRequestCallback[] }));
vi.mock('../../src/data/app', () => ({ appApi: { rendererReady: fixture.ready } }));
vi.mock('../../src/data/client', () => ({ isDesktopRuntime: () => true, hasBridge: () => true }));
import { useStartupReady } from '../../src/components/app/hooks/useStartupReady';
beforeEach(() => { fixture.ready.mockClear(); fixture.frames = []; vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => fixture.frames.push(fn)); vi.stubGlobal('cancelAnimationFrame', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('holds installer readiness until loading finishes and the initial view has painted', async () => {
  const hook = renderHook(({ ready }) => useStartupReady(ready), { initialProps: { ready: false } });
  expect(fixture.frames).toHaveLength(0); hook.rerender({ ready: true });
  expect(fixture.ready).not.toHaveBeenCalled(); fixture.frames.shift()?.(0);
  expect(fixture.ready).not.toHaveBeenCalled(); fixture.frames.shift()?.(16);
  expect(fixture.ready).toHaveBeenCalledOnce();
});
