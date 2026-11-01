import type { Db } from './types.js';
import { netStockComponents, stockComponents, type StockLine } from '../../utils/invoiceStock.js';
import type { StockGroup } from '../../utils/stockOperation.js';

/** The physical state represented by a complete document and its returns, independent of product balances. */
export function documentStockVector(db: Db, type: StockGroup, id: string): { product_id: string; quantity: number }[] {
  let parts: {product_id:string;quantity:number}[];
  if(type==='invoice') {
    const inv=db.prepare('SELECT * FROM invoices WHERE invoice_id=?').get(id) as Record<string,unknown> | undefined;
    if(!inv || inv.is_deleted || inv.stock_applied===0 || inv.converted_from_invoice_id || inv.converted_from_invoice_number || ['HOLD','EXPIRED_HOLD'].includes(String(inv.invoice_type))) return [];
    const sold=db.prepare('SELECT product_id,quantity,combo_id,combo_details,is_service_item FROM invoice_items WHERE invoice_id=?').all(id) as StockLine[];
    const returned=db.prepare(`SELECT ri.product_id,ri.quantity,ri.combo_details FROM return_items ri JOIN returns r ON r.return_id=ri.return_id
      WHERE r.invoice_id=? AND r.is_deleted=0`).all(id) as StockLine[];
    parts=netStockComponents(sold,returned).map(p=>({...p,quantity:-p.quantity}));
  }else if(type==='return') {
    const row=db.prepare('SELECT * FROM returns WHERE return_id=?').get(id) as Record<string,unknown> | undefined;
    if(!row || row.is_deleted || row.invoice_id) return [];
    parts=(db.prepare('SELECT product_id,quantity,combo_details FROM return_items WHERE return_id=?').all(id) as StockLine[]).flatMap(stockComponents);
  }else{
    const row=db.prepare('SELECT * FROM purchase_bills WHERE purchase_bill_id=?').get(id) as Record<string,unknown> | undefined;
    if(!row) return [];
    parts=(db.prepare('SELECT product_id,quantity,skip_stock_update FROM purchase_bill_items WHERE purchase_bill_id=?').all(id) as (StockLine & {skip_stock_update?:number})[])
      .filter(p=>row.bill_type==='ESTIMATE' || p.skip_stock_update!==1).flatMap(stockComponents);
  }
  const total=new Map<string,number>();
  const physical=db.prepare('SELECT 1 FROM products WHERE product_id=? AND COALESCE(is_service_item,0)=0');
  for(const part of parts)if(physical.get(part.product_id))total.set(part.product_id,(total.get(part.product_id)??0)+part.quantity);
  return [...total].filter(([,qty])=>qty!==0).sort(([a],[b])=>a.localeCompare(b)).map(([product_id,quantity])=>({product_id,quantity}));
}
