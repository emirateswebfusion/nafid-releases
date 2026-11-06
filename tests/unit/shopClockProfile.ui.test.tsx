// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(() => ({ get:vi.fn(), sync:undefined as (() => void) | undefined }));
vi.mock('../../src/data/settings',()=>({getSetting:state.get}));
vi.mock('../../src/data/client',()=>({isDesktopRuntime:()=>true}));
vi.mock('../../src/data/events',()=>({bridgeEvents:{onSyncDataUpdated:(fn:()=>void)=>{state.sync=fn;return ()=>{};}}}));
import { useStoreProfile } from '../../src/hooks/useStoreProfile';
import { getStoreTimezone } from '../../src/utils/time/timezoneHelper';
import { getAppTimeFormat } from '../../src/utils/time/timeFormat';
afterEach(cleanup);
it('loads the tenant clock format and refreshes both settings after synchronization',async()=>{
  const settings:Record<string,unknown>={store_country:'AE',store_timezone:'Asia/Dubai',time_format:'24h'};
  state.get.mockImplementation(async({key}:{key:string})=>settings[key]??null);
  const hook=renderHook(()=>useStoreProfile('shop',true));
  await waitFor(()=>expect(hook.result.current).toBe(true));
  expect(getStoreTimezone()).toBe('Asia/Dubai');expect(getAppTimeFormat()).toBe('24h');
  settings.store_timezone='America/New_York';settings.time_format='12h';
  await act(async()=>{state.sync?.();});
  await waitFor(()=>expect(getStoreTimezone()).toBe('America/New_York'));
  expect(getAppTimeFormat()).toBe('12h');
  expect(state.get).toHaveBeenCalledWith({tenant_id:'shop',key:'time_format'});
});
