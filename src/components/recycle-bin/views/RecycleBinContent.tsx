import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  type DeletedCustomer, type DeletedInvoice, type DeletedParty, type DeletedProduct, type RecycleBinCategory,
} from '../recycleBinTypes';
import type { RecycleBinState } from '../hooks/useRecycleBinState';
import { CustomerCardsView } from './CustomerCardsView';
import { InvoiceCardsView } from './InvoiceCardsView';
import { InvoiceTableView } from './InvoiceTableView';
import { PartyCardsView } from './PartyCardsView';
import { ProductCardsView } from './ProductCardsView';

export interface RecycleBinContentProps {
  activeCategory: RecycleBinCategory;
  askHardDeleteCustomer: (cust: DeletedCustomer) => void;
  askHardDeleteInvoice: (inv: DeletedInvoice) => void;
  askHardDeleteParty: (party: DeletedParty) => void;
  askHardDeleteProduct: (prod: DeletedProduct) => void;
  filteredCustomers: DeletedCustomer[];
  filteredInvoices: DeletedInvoice[];
  filteredParties: DeletedParty[];
  filteredProducts: DeletedProduct[];
  handleInspectInvoice: (inv: DeletedInvoice) => Promise<void>;
  isAdmin: boolean;
  isCurrentLoading: boolean;
  rb: RecycleBinState;
  restoreCustomer: (customer_id: string, name: string) => Promise<void>;
  restoreInvoice: (invoice_id: string, invoice_number: string) => Promise<void>;
  restoreParty: (party_id: string, name: string) => Promise<void>;
  restoreProduct: (product_id: string, name: string) => Promise<void>;
}

/** Main content area: loading state, per-category empty states and the bill / product / customer / party lists. */
export function RecycleBinContent({
  activeCategory, askHardDeleteCustomer, askHardDeleteInvoice, askHardDeleteParty, askHardDeleteProduct,
  filteredCustomers, filteredInvoices, filteredParties, filteredProducts, handleInspectInvoice, isAdmin,
  isCurrentLoading, rb, restoreCustomer, restoreInvoice, restoreParty, restoreProduct,
}: RecycleBinContentProps) {
  const { viewMode } = rb;
  return (
      <main className="flex-1 overflow-y-auto p-6">
        {isCurrentLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
            <p className="text-xs font-semibold">Loading deleted records...</p>
          </div>
        ) : activeCategory === 'SALES_BILLS' ? (
          filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Bills</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All your billing records are active and accounted for. Any bills deleted from Sales History will appear here ready to restore.
              </p>
            </div>
          ) : viewMode === 'cards' ? (
            <InvoiceCardsView
              askHardDeleteInvoice={askHardDeleteInvoice}
              filteredInvoices={filteredInvoices}
              handleInspectInvoice={handleInspectInvoice}
              isAdmin={isAdmin}
              restoreInvoice={restoreInvoice}
            />
          ) : (
            /* Table View */
            <InvoiceTableView
              askHardDeleteInvoice={askHardDeleteInvoice}
              filteredInvoices={filteredInvoices}
              handleInspectInvoice={handleInspectInvoice}
              isAdmin={isAdmin}
              restoreInvoice={restoreInvoice}
            />
          )
        ) : activeCategory === 'PRODUCTS' ? (
          filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Products</h3>
              <p className="text-xs text-muted-foreground">All inventory catalog products are active.</p>
            </div>
          ) : (
            <ProductCardsView
              askHardDeleteProduct={askHardDeleteProduct}
              filteredProducts={filteredProducts}
              isAdmin={isAdmin}
              restoreProduct={restoreProduct}
            />
          )
        ) : activeCategory === 'CUSTOMERS' ? (
          filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Customers</h3>
              <p className="text-xs text-muted-foreground">All customer profiles are active in the system.</p>
            </div>
          ) : (
            <CustomerCardsView
              askHardDeleteCustomer={askHardDeleteCustomer}
              filteredCustomers={filteredCustomers}
              isAdmin={isAdmin}
              restoreCustomer={restoreCustomer}
            />
          )
        ) : (
          filteredParties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-center max-w-sm mx-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Deleted Suppliers</h3>
              <p className="text-xs text-muted-foreground">All vendor and supplier parties are active.</p>
            </div>
          ) : (
            <PartyCardsView
              askHardDeleteParty={askHardDeleteParty}
              filteredParties={filteredParties}
              isAdmin={isAdmin}
              restoreParty={restoreParty}
            />
          )
        )}
      </main>
  );
}
