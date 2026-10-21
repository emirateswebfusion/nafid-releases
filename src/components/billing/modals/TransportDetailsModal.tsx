import React from 'react';
import { Truck, X } from 'lucide-react';

interface TransportDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: any;
  updateActiveTab: (updates: any) => void;
}

export function TransportDetailsModal({
  isOpen,
  onClose,
  activeTab,
  updateActiveTab,
}: TransportDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Transporter & E-Way Bill Details</h3>
              <p className="text-xs text-muted-foreground">Add transport information for GST Boxed invoices</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="space-y-3">
            <span className="text-xs font-bold text-primary uppercase tracking-wider block border-b border-border/60 pb-1">Transporter Information</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Name</label>
                <input type="text" value={activeTab?.transporterName || ''} onChange={(e) => updateActiveTab({ transporterName: e.target.value })} placeholder="e.g. Sanjay Transportation" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Vehicle Number</label>
                <input type="text" value={activeTab?.vehicleNumber || ''} onChange={(e) => updateActiveTab({ vehicleNumber: e.target.value.toUpperCase() })} placeholder="e.g. KL-07-AB-1234" className="w-full text-xs font-mono font-medium uppercase bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Doc / LR No.</label>
                <input type="text" value={activeTab?.transporterDocNo || ''} onChange={(e) => updateActiveTab({ transporterDocNo: e.target.value })} placeholder="e.g. DOC12345" className="w-full text-xs font-mono font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Transporter Doc Date</label>
                <input type="date" value={activeTab?.transporterDocDate || ''} onChange={(e) => updateActiveTab({ transporterDocDate: e.target.value })} className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">E-Way Bill Number</label>
                <input type="text" value={activeTab?.ewayBillNo || ''} onChange={(e) => updateActiveTab({ ewayBillNo: e.target.value })} placeholder="e.g. 101019999999" className="w-full text-xs font-mono font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">E-Way Bill Date</label>
                <input type="date" value={activeTab?.ewayBillDate || ''} onChange={(e) => updateActiveTab({ ewayBillDate: e.target.value })} className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <span className="text-xs font-bold text-primary uppercase tracking-wider block border-b border-border/60 pb-1">Separate Shipping Details (Optional)</span>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Shipping Recipient Name</label>
                <input type="text" value={activeTab?.shippingName || ''} onChange={(e) => updateActiveTab({ shippingName: e.target.value })} placeholder="Same as customer name if left blank" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Shipping Address</label>
                <input type="text" value={activeTab?.shippingAddress || ''} onChange={(e) => updateActiveTab({ shippingAddress: e.target.value })} placeholder="Full delivery address" className="w-full text-xs font-medium bg-background border border-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              updateActiveTab({
                transporterName: '',
                vehicleNumber: '',
                transporterDocNo: '',
                transporterDocDate: '',
                ewayBillNo: '',
                ewayBillDate: '',
                shippingName: '',
                shippingAddress: '',
                shippingGstin: ''
              });
              onClose();
            }}
            className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive cursor-pointer"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs hover:bg-primary/90 cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
