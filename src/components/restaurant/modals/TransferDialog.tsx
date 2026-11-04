import { Modal } from '../../ui/Modal';
import type { DiningTable, RestaurantOrder } from '../../../data/restaurant';

interface TransferDialogProps {
  order: RestaurantOrder;
  tables: DiningTable[];
  openOrders: RestaurantOrder[];
  onCancel: () => void;
  onMove: (table: DiningTable) => void;
  onMerge: (target: RestaurantOrder) => void;
}

/** Move to a free table, or merge this order into another open order (its table or token). */
export function TransferDialog({ order, tables, openOrders, onCancel, onMove, onMerge }: TransferDialogProps) {
  const others = openOrders.filter(o => o.order_id !== order.order_id && o.status === 'OPEN');
  const label = (o: RestaurantOrder) => o.table_id ? `Table ${tables.find(t => t.table_id === o.table_id)?.label ?? '?'} · ${o.order_no}` : `#${o.order_no}`;
  const free = tables.filter(t => t.is_active && !openOrders.some(o => o.table_id === t.table_id));
  return (
    <Modal isOpen onClose={onCancel} title={`Move / merge ${order.order_no}`}>
      {order.order_type === 'DINE_IN' && (
        <>
          <div className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Move to a free table</div>
          <div className="mb-5 flex flex-wrap gap-2">
            {free.map(t => (
              <button key={t.table_id} type="button" onClick={() => onMove(t)}
                className="min-w-[64px] rounded-xl border border-border px-3 py-2 font-black hover:border-primary">{t.label}</button>
            ))}
            {free.length === 0 && <span className="text-sm text-muted-foreground">No free tables</span>}
          </div>
        </>
      )}
      <div className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Merge into</div>
      <div className="flex flex-wrap gap-2">
        {others.map(o => (
          <button key={o.order_id} type="button" onClick={() => onMerge(o)}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary">{label(o)}</button>
        ))}
        {others.length === 0 && <span className="text-sm text-muted-foreground">No other open orders</span>}
      </div>
    </Modal>
  );
}
