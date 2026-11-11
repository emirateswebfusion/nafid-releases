import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Modal } from '../ui/Modal';
import { RedCrossButton } from '../ui/RedCrossButton';
import { productsApi, type Product } from '../../data/products';
import { partiesApi, type Party } from '../../data/parties';
import { returnsApi } from '../../data/returns';
import { useAuthStore } from '../../store/authStore';
import { getStoreBusinessDate, storeWallClockToUtcIso } from '../../utils/time/timezoneHelper';
import { formatCurrency } from '../../utils/pricing/money';
import { hasPermission } from '../../utils/security/permissions';
import { creditNoteTotals } from './creditNote';

type Line = { productId: string; query: string; quantity: string; rate: string; tax: string };
const emptyLine = (): Line => ({ productId:'', query:'', quantity:'1', rate:'', tax:'0' });
export function CreditNoteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const auth = useAuthStore();
  const [products,setProducts] = useState<Product[]>([]);
  const [parties,setParties] = useState<Party[]>([]);
  const [reference,setReference] = useState('');
  const [date,setDate] = useState(getStoreBusinessDate());
  const [partyId,setPartyId] = useState('');
  const [method,setMethod] = useState<'CREDIT'|'CASH'>('CREDIT');
  const [lines,setLines] = useState<Line[]>([emptyLine()]);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    if (!auth.tenantId) return;
    Promise.all([productsApi.getProducts({tenant_id:auth.tenantId,limit:20000}),partiesApi.getParties(auth.tenantId)])
      .then(([p,a]) => { setProducts(p);setParties(a.filter(party => party.party_type === 'CUSTOMER' || !party.party_type)); })
      .catch(() => setError('Could not load products and customer accounts.'));
  },[auth.tenantId]);
  const update = (index: number, patch: Partial<Line>) => setLines(previous => previous.map((line,i) => i === index ? {...line,...patch} : line));
  const priced = () => creditNoteTotals(lines.map(line => ({ productId:line.productId,name:products.find(product => product.product_id === line.productId)?.name || '',quantity:Number(line.quantity),unitPrice:line.rate.trim() ? Number(line.rate) : NaN,tax:line.tax.trim() ? Number(line.tax) : NaN })));
  let total = 0;try { total = priced().total; } catch { /* incomplete form */ }
  const save = async () => {
    if (saving) return;
    setError('');
    try {
      if (!hasPermission(auth,'sales.refund')) throw new Error('Permission to issue returns is required.');
      if (!reference.trim()) throw new Error('Enter the credit note number from the original document.');
      if (!auth.tenantId) throw new Error('Sign in to the shop first.');
      const returnDate = storeWallClockToUtcIso(date, '00:00');
      if (!returnDate) throw new Error('Enter a valid return date.');
      const party = parties.find(item => item.party_id === partyId);
      if (method === 'CREDIT' && !party) throw new Error('Choose the customer account to credit.');
      const totals = priced();
      setSaving(true);
      const result = await returnsApi.createReturn({ return_id:uuid(),invoice_id:null,tenant_id:auth.tenantId,user_id:auth.userId || undefined,user_name:auth.userName || undefined,
        return_number:reference.trim(),return_date:returnDate,customer_name:party?.name,customer_phone:party?.phone || undefined,customer_address:party?.address || undefined,
        subtotal:totals.subtotal,tax_total:totals.tax,grand_total:totals.total,refund_method:method,reason:`Historical credit note ${reference.trim()}; original invoice unavailable`,items:totals.items.map(item => ({...item,return_item_id:uuid()})) });
      if (!result.success) throw new Error(result.error || 'Could not save the credit note.');
      onSaved();
    } catch (failure) {setError(failure instanceof Error ? failure.message : 'Could not save the credit note.');}
    finally {setSaving(false);}
  };
  const field = 'rounded border border-border bg-background px-3 py-2 text-sm w-full';
  return <Modal isOpen onClose={onClose} closeButton={<RedCrossButton onClick={onClose}/>}>
    <div className="p-5 max-w-4xl w-[90vw] max-h-[85vh] overflow-auto space-y-4">
      <h2 className="text-lg font-bold">Record historical credit note</h2>
      <p className="text-sm text-muted-foreground">Use the original document's date, item rates and line tax when its sale is outside NAFID. Returned quantities are added to the selected products.</p>
      <div className="grid grid-cols-2 gap-3">
        <label>Credit note number<input aria-label="Credit note number" className={field} value={reference} onChange={event => setReference(event.target.value)}/></label>
        <label>Return date<input aria-label="Return date" type="date" className={field} value={date} onChange={event => setDate(event.target.value)}/></label>
        <label>Refund method<select aria-label="Refund method" className={field} value={method} onChange={event => setMethod(event.target.value as 'CREDIT'|'CASH')}><option value="CREDIT">Customer account credit</option><option value="CASH">Cash refund</option></select></label>
        <label>Customer account<select aria-label="Customer account" className={field} value={partyId} onChange={event => setPartyId(event.target.value)}><option value="">Walk-in / choose account</option>{parties.map(party => <option key={party.party_id} value={party.party_id}>{party.name}</option>)}</select></label>
      </div>
      {lines.map((line,index) => {
        const matching = products.filter(product => product.name.toLowerCase().includes(line.query.toLowerCase()) || product.product_id === line.productId).slice(0,30);
        return <div key={index} className="border border-border rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input aria-label={`Product search ${index+1}`} placeholder="Search returned product" className={field} value={line.query} onChange={event => update(index,{query:event.target.value})}/>
            <select aria-label={`Return product ${index+1}`} className={field} value={line.productId} onChange={event => update(index,{productId:event.target.value})}><option value="">Choose product</option>{matching.map(product => <option key={product.product_id} value={product.product_id}>{product.name} · {product.sku_barcode || product.product_id.slice(0,8)} · Stock {product.current_stock}</option>)}</select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <label>Quantity<input aria-label={`Quantity ${index+1}`} type="number" min="0.001" step="0.001" className={field} value={line.quantity} onChange={event => update(index,{quantity:event.target.value})}/></label>
            <label>Unit price before tax<input aria-label={`Unit price ${index+1}`} type="number" min="0" step="any" className={field} value={line.rate} onChange={event => update(index,{rate:event.target.value})}/></label>
            <label>Tax for this line<input aria-label={`Line tax ${index+1}`} type="number" min="0" step="any" className={field} value={line.tax} onChange={event => update(index,{tax:event.target.value})}/></label>
            <button type="button" disabled={lines.length===1 || saving} onClick={() => setLines(previous => previous.filter((_,i) => i!==index))}>Remove line</button>
          </div>
        </div>;
      })}
      <button type="button" disabled={saving} onClick={() => setLines(previous => [...previous,emptyLine()])}>Add return line</button>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex items-center justify-between"><strong>Total credit: {formatCurrency(total)}</strong><button type="button" disabled={saving} className="rounded bg-primary text-primary-foreground px-4 py-2" onClick={save}>{saving ? 'Saving…' : 'Save credit note'}</button></div>
    </div>
  </Modal>;
}
