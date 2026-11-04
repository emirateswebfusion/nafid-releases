// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CreditNoteDialog } from '../../src/components/returns/CreditNoteDialog';
import { useAuthStore } from '../../src/store/authStore';
const create = vi.hoisted(() => vi.fn(async () => ({success:true})));
vi.mock('../../src/data/products', () => ({productsApi:{getProducts:async()=>[{product_id:'p',name:'Carburettor',current_stock:0}]}}));
vi.mock('../../src/data/parties', () => ({partiesApi:{getParties:async()=>[{party_id:'a',name:'Sugathan',party_type:'CUSTOMER'}]}}));
vi.mock('../../src/data/returns', () => ({returnsApi:{createReturn:create}}));
afterEach(()=>{cleanup();create.mockClear();localStorage.clear();});
it('saves original note/date/items as account credit without an invented invoice', async()=>{
  useAuthStore.setState({tenantId:'t',userId:'u',role:'ADMIN',permissions:[]});localStorage.setItem('app_store_timezone','Asia/Kolkata');
  const saved=vi.fn();render(<CreditNoteDialog onClose={()=>{}} onSaved={saved}/>);
  await waitFor(()=>expect(screen.getByRole('option',{name:'Sugathan'})).toBeTruthy());
  for(const [label,value] of [['Credit note number','CDNR/00149'],['Return date','2026-11-04'],['Customer account','a'],['Return product 1','p'],['Unit price 1','1144.07'],['Line tax 1','205.93']])fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
  fireEvent.click(screen.getByRole('button',{name:'Save credit note'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(create).toHaveBeenCalledWith(expect.objectContaining({invoice_id:null,return_number:'CDNR/00149',return_date:'2026-11-03T18:30:00.000Z',customer_name:'Sugathan',refund_method:'CREDIT',grand_total:1350,items:[expect.objectContaining({product_id:'p',quantity:1,unit_price:1144.07,tax_amount:205.93,total:1144.07})]}));
});
