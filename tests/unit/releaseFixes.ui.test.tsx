// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PricingSection, type PricingSectionProps } from '../../src/components/inventory/views/form/PricingSection';
import { QuickPinLogin } from '../../src/components/auth/QuickPinLogin';
import { useFeatureFlagsStore, DEFAULT_FEATURE_FLAGS } from '../../src/config/featureFlags';
import { buildAttendanceMonth } from '../../src/utils/time/staffAttendance';
afterEach(cleanup);
const props = { activePricingTiers:[],enableRealPaperStock:false,formData:{uom:'Pcs',domain_attributes:{},purchase_price:0,base_price:100,current_stock:0,low_stock_threshold:0},handleDomainAttrChange:vi.fn(),handleInputChange:vi.fn(),setTierPrices:vi.fn(),tierPrices:{} } as unknown as PricingSectionProps;
it('adds an inline tier once while saving and keeps failures editable', async () => {
  useFeatureFlagsStore.getState().setFlags({...DEFAULT_FEATURE_FLAGS,pricing_tiers:true});
  let finish: (value:{success:boolean;error?:string})=>void = () => {};
  const add = vi.fn(() => new Promise<{success:boolean;error?:string}>(resolve => {finish=resolve;}));
  render(<PricingSection {...props} onAddPricingTier={add} />);
  fireEvent.click(screen.getByRole('button',{name:'Add Tier'}));
  const input = screen.getByPlaceholderText(/Tier Name/);
  fireEvent.change(input,{target:{value:' Wholesale '}});
  fireEvent.keyDown(input,{key:'Enter'});fireEvent.keyDown(input,{key:'Enter'});
  expect(add).toHaveBeenCalledTimes(1);expect(add).toHaveBeenCalledWith('Wholesale');
  finish({success:false,error:'Name already exists'});
  await screen.findByText('Name already exists');
  fireEvent.change(input,{target:{value:'VIP'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));
  finish({success:true});
  await waitFor(()=>expect(screen.queryByPlaceholderText(/Tier Name/)).toBeNull());
});
it('shows the last user and an explicit switch action on PIN sign in', () => {
  const switchUser=vi.fn();
  render(<QuickPinLogin shopName="Shop B" userName="Mohammed" role="ADMIN" onSwitchToEmail={switchUser}/>);
  expect(screen.getByText(/Mohammed - Admin/)).toBeDefined();expect(screen.getByText('Shop B')).toBeDefined();
  fireEvent.click(screen.getByRole('button',{name:/Log out to switch account/}));expect(switchUser).toHaveBeenCalledOnce();
});
it('offers every date in an empty attendance month and preserves recorded states', () => {
  expect(buildAttendanceMonth('2026-11',[])).toHaveLength(30);
  const records=buildAttendanceMonth('2026-11',[{attendance_id:'a',date:'2026-11-02',status:'HALF_DAY'}]);
  expect(records[0].status).toBe('NOT_MARKED');expect(records[1].status).toBe('HALF_DAY');
  expect(buildAttendanceMonth('2026-13',[])).toEqual([]);
});
