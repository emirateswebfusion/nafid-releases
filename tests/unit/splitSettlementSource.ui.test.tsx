// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SplitSettlementDialog } from '../../src/components/cashier/views/SplitSettlementDialog';
const submit = vi.hoisted(() => vi.fn(async (_payload: unknown) => ({success:true})));
vi.mock('../../src/data/cashier', () => ({cashierApi:{settlePayment:submit}}));
afterEach(cleanup);
it.each(['selected',''])('submits the selected or displayed fallback UPI account (%s)', async selected => {
  submit.mockClear();
  const noop = vi.fn();
  const props = {getRawNet:()=>100,load:async()=>{},rowDiscs:{},selectedUpiSourceId:selected,setSelectedUpiSourceId:noop,
    setSplitBank:noop,setSplitCard:noop,setSplitCash:noop,setSplitModalInvoice:noop,setSplitSubmitting:noop,setSplitUpi:noop,
    splitBank:0,splitCard:0,splitCash:60,splitModalInvoice:{invoice_id:'i',invoice_number:'INV-1',grand_total:100},splitModalNet:100,
    splitSubmitting:false,splitUpi:40,tenantId:'t',upiPageConfig:{settlement:true},
    upiSources:[{source_id:'fallback',name:'Fallback',upi_id:'first@upi'},{source_id:'selected',name:'Selected',upi_id:'abc@upi'}],userId:'u',userName:'User'};
  render(<SplitSettlementDialog {...props as unknown as Parameters<typeof SplitSettlementDialog>[0]} />);
  fireEvent.click(screen.getByRole('button',{name:'Confirm Split Settlement'}));
  await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({split_details:expect.objectContaining({cash:60,upi:40,upi_source_id:selected || 'fallback'})})));
});
