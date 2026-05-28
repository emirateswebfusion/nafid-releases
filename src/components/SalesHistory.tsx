import { useState, useEffect } from 'react';
import { Receipt, Search, Calendar, User, Phone, Tag } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';

export function SalesHistory({ onClose }: { onClose: () => void }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadInvoices();

    if (window.electronAPI) {
      window.electronAPI.onSyncDataUpdated(() => {
        console.log('[SalesHistory] Data updated via sync. Refreshing list...');
        loadInvoices();
      });
    }
  }, []);

  const loadInvoices = async () => {
    if (window.electronAPI) {
      const { userId, role, tenantId } = useAuthStore.getState();
      
      const data = await window.electronAPI.dbGetInvoices({ 
        user_id: userId, 
        tenant_id: tenantId,
        role: role 
      });
      setInvoices(Array.isArray(data) ? data : []);
      setLoading(false);
    }
  };

  const handleSelectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    if (window.electronAPI) {
      const data = await window.electronAPI.dbGetInvoiceItems(inv.invoice_id);
      setItems(Array.isArray(data) ? data : []);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customer_name && inv.customer_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      className="max-w-6xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
      title={
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sales History</h1>
            <p className="text-muted-foreground text-sm font-normal">View and manage past billing records</p>
          </div>
        </div>
      }
    >
      <div className="flex-1 flex overflow-hidden -mx-6 -mb-6 h-[calc(85vh-88px)]">
        {/* Left Side: Invoice List */}
        <div className="w-1/3 border-r border-border flex flex-col bg-muted/10 h-full">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search invoice # or customer..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 h-full">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">Loading history...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No records found</div>
            ) : (
              filteredInvoices.map((inv) => (
                <button
                  key={inv.invoice_id}
                  onClick={() => handleSelectInvoice(inv)}
                  className={clsx(
                    "w-full text-left p-4 rounded-xl border transition-all group",
                    selectedInvoice?.invoice_id === inv.invoice_id
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/50"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</span>
                    <span className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                      inv.sync_status === 'SYNCED' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {inv.sync_status}
                    </span>
                  </div>
                  <div className={clsx("font-bold text-lg", selectedInvoice?.invoice_id === inv.invoice_id ? "text-primary" : "text-foreground")}>₹{inv.grand_total.toFixed(2)}</div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(inv.created_at).toLocaleString()}
                    </div>
                    {inv.cashier_name && (
                      <div className="flex items-center gap-1 font-medium truncate max-w-[100px]" title={inv.cashier_name}>
                        <User className="w-3 h-3" />
                        {inv.cashier_name}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Invoice Details */}
        <div className="flex-1 overflow-y-auto bg-background h-full">
          {selectedInvoice ? (
            <div className="p-8 max-w-3xl mx-auto">
              <div className="flex justify-between items-start mb-8 pb-8 border-b border-border">
                <div>
                  <h2 className="text-4xl font-black text-foreground mb-2">{selectedInvoice.invoice_number}</h2>
                  <div className="flex items-center gap-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      <span className="uppercase font-bold text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                        {selectedInvoice.invoice_type}
                      </span>
                    </div>
                    {selectedInvoice.cashier_name && (
                      <div className="flex items-center gap-2 text-xs">
                        <User className="w-4 h-4" />
                        <span>Billed by: <span className="font-bold text-foreground">{selectedInvoice.cashier_name}</span></span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground text-xs uppercase font-bold tracking-widest mb-1">Grand Total</div>
                  <div className="text-5xl font-black text-primary">₹{selectedInvoice.grand_total.toFixed(2)}</div>
                </div>
              </div>

              {/* Customer Info */}
              {(selectedInvoice.customer_name || selectedInvoice.customer_phone) && (
                <div className="grid grid-cols-2 gap-6 mb-8 p-6 bg-muted/30 border border-border rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-muted rounded-xl text-muted-foreground">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-bold uppercase">Customer</div>
                      <div className="text-foreground font-medium">{selectedInvoice.customer_name || 'Walk-in Customer'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-muted rounded-xl text-muted-foreground">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-bold uppercase">Contact</div>
                      <div className="text-foreground font-medium">{selectedInvoice.customer_phone || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
                <div className="col-span-6">Item Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-2 text-right">Total</div>
              </div>

              {/* Items */}
              <div className="divide-y divide-border/50 mb-8">
                {items.map((item) => (
                  <div key={item.item_id} className="grid grid-cols-12 gap-4 px-4 py-4 items-center">
                    <div className="col-span-6 text-foreground font-medium">{item.name || 'Unknown Product'}</div>
                    <div className="col-span-2 text-center text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-2 text-right text-muted-foreground">₹{item.unit_price.toFixed(2)}</div>
                    <div className="col-span-2 text-right text-foreground font-bold">₹{item.total.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end">
                <div className="w-72 space-y-3 bg-muted/10 p-6 rounded-2xl border border-border">
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Subtotal</span>
                    <span>₹{selectedInvoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Tax Amount</span>
                    <span>₹{selectedInvoice.tax_total.toFixed(2)}</span>
                  </div>
                  {selectedInvoice.discount_total > 0 && (
                    <div className="flex justify-between text-destructive text-sm">
                      <span>Discount</span>
                      <span>-₹{selectedInvoice.discount_total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-border flex justify-between text-foreground font-black text-xl">
                    <span>Grand Total</span>
                    <span className="text-primary">₹{selectedInvoice.grand_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
              <Receipt className="w-20 h-20 opacity-20" />
              <p className="text-xl">Select an invoice to view details</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
