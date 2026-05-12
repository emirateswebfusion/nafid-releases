import { useState, useEffect } from 'react';
import { X, Receipt, Search, Calendar, User, Phone, Tag } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-6xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Sales History</h1>
              <p className="text-neutral-400 text-sm">View and manage past billing records</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Side: Invoice List */}
          <div className="w-1/3 border-r border-neutral-800 flex flex-col bg-neutral-950/30">
            <div className="p-4 border-b border-neutral-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input 
                  type="text" 
                  placeholder="Search invoice # or customer..."
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {loading ? (
                <div className="p-4 text-center text-neutral-500">Loading history...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-neutral-600">No records found</div>
              ) : (
                filteredInvoices.map((inv) => (
                  <button
                    key={inv.invoice_id}
                    onClick={() => handleSelectInvoice(inv)}
                    className={clsx(
                      "w-full text-left p-4 rounded-xl border transition-all group",
                      selectedInvoice?.invoice_id === inv.invoice_id
                        ? "bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/5"
                        : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-neutral-500">{inv.invoice_number}</span>
                      <span className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                        inv.sync_status === 'SYNCED' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                      )}>
                        {inv.sync_status}
                      </span>
                    </div>
                    <div className="text-white font-bold text-lg">₹{inv.grand_total.toFixed(2)}</div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(inv.created_at).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Side: Invoice Details */}
          <div className="flex-1 overflow-y-auto bg-neutral-950">
            {selectedInvoice ? (
              <div className="p-8 max-w-3xl mx-auto">
                <div className="flex justify-between items-start mb-8 pb-8 border-b border-neutral-800">
                  <div>
                    <h2 className="text-4xl font-black text-white mb-2">{selectedInvoice.invoice_number}</h2>
                    <div className="flex items-center gap-6 text-neutral-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        <span className="uppercase font-bold text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300">
                          {selectedInvoice.invoice_type}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-neutral-500 text-xs uppercase font-bold tracking-widest mb-1">Grand Total</div>
                    <div className="text-5xl font-black text-blue-400">₹{selectedInvoice.grand_total.toFixed(2)}</div>
                  </div>
                </div>

                {/* Customer Info */}
                {(selectedInvoice.customer_name || selectedInvoice.customer_phone) && (
                  <div className="grid grid-cols-2 gap-6 mb-8 p-6 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-neutral-800 rounded-xl text-neutral-400">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 font-bold uppercase">Customer</div>
                        <div className="text-white font-medium">{selectedInvoice.customer_name || 'Walk-in Customer'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-neutral-800 rounded-xl text-neutral-400">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 font-bold uppercase">Contact</div>
                        <div className="text-white font-medium">{selectedInvoice.customer_phone || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                  <div className="col-span-6">Item Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {/* Items */}
                <div className="divide-y divide-neutral-800/50 mb-8">
                  {items.map((item) => (
                    <div key={item.item_id} className="grid grid-cols-12 gap-4 px-4 py-4 items-center">
                      <div className="col-span-6 text-white font-medium">{item.name || 'Unknown Product'}</div>
                      <div className="col-span-2 text-center text-neutral-400">{item.quantity}</div>
                      <div className="col-span-2 text-right text-neutral-400">₹{item.unit_price.toFixed(2)}</div>
                      <div className="col-span-2 text-right text-white font-bold">₹{item.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>

                {/* Totals Summary */}
                <div className="flex justify-end">
                  <div className="w-72 space-y-3 bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800">
                    <div className="flex justify-between text-neutral-400 text-sm">
                      <span>Subtotal</span>
                      <span>₹{selectedInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400 text-sm">
                      <span>Tax Amount</span>
                      <span>₹{selectedInvoice.tax_total.toFixed(2)}</span>
                    </div>
                    {selectedInvoice.discount_total > 0 && (
                      <div className="flex justify-between text-rose-400 text-sm">
                        <span>Discount</span>
                        <span>-₹{selectedInvoice.discount_total.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-3 border-t border-neutral-800 flex justify-between text-white font-black text-xl">
                      <span>Grand Total</span>
                      <span className="text-blue-400">₹{selectedInvoice.grand_total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-4">
                <Receipt className="w-20 h-20 opacity-10" />
                <p className="text-xl">Select an invoice to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
