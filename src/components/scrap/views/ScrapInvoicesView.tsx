import React, { Fragment } from 'react';
import { Layers, IndianRupee, Package, Search, X, Recycle, FileText, Pencil, Trash } from 'lucide-react';
import { formatCurrency, formatGroupDate } from '../scrapFormat';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import { parseUTCDate } from '../../../utils/print/receiptGenerator';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import clsx from 'clsx';
import type { ScrapInvoiceRow } from '../scrapTypes';

export interface ScrapInvoicesViewProps {
  filteredInvoices: ScrapInvoiceRow[];
  handleEditInvoiceInBilling: (invoiceNumber: string) => void;
  invoiceDateFrom: string;
  invoiceDateTo: string;
  invoiceSearch: string;
  isOwner: true;
  openInvoiceDetail: (invoiceNumber: string) => Promise<void>;
  setConfirmDeleteInvoiceNumber: React.Dispatch<React.SetStateAction<string | null>>;
  setInvoiceDateFrom: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceDateTo: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceSearch: React.Dispatch<React.SetStateAction<string>>;
}

/** Scrap invoices list with search and date filters. */
export function ScrapInvoicesView({
  filteredInvoices, handleEditInvoiceInBilling, invoiceDateFrom, invoiceDateTo, invoiceSearch, isOwner,
  openInvoiceDetail, setConfirmDeleteInvoiceNumber, setInvoiceDateFrom, setInvoiceDateTo, setInvoiceSearch,
}: ScrapInvoicesViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background select-none w-full px-4 sm:px-6 py-4 space-y-4">
      {/* Themed stats cards */}
      <div className="grid grid-cols-3 gap-5 select-none shrink-0">
        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-orange-500/10 to-orange-500/5 text-orange-600 dark:text-orange-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{filteredInvoices.length}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Invoices</p>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{formatCurrency(filteredInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0))}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Scrap Value</p>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
          <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Package className="w-5 h-5" />
          </div>
          <div className="leading-tight text-left min-w-0 flex-1">
            <p className="text-2xl font-black text-foreground font-mono truncate">{filteredInvoices.reduce((s, inv) => s + Number(inv.item_count || 0), 0)}</p>
            <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Items Collected</p>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-start bg-card border border-border p-4 rounded-[28px] shadow-sm px-6 py-3.5 shrink-0 select-none relative z-30">
        <div className="relative w-full sm:w-80 md:w-96 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
          <input
            type="text"
            placeholder="Search invoice number, customer name, phone..."
            value={invoiceSearch}
            onChange={e => setInvoiceSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground"
          />
          {invoiceSearch && (
            <button
              onClick={() => setInvoiceSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DateRangeFilter
            startDate={invoiceDateFrom}
            endDate={invoiceDateTo}
            align="left"
            onChange={(start, end) => {
              setInvoiceDateFrom(start);
              setInvoiceDateTo(end);
            }}
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="flex-1 overflow-y-auto bg-muted/[0.02]">
        <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm p-6 flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border bg-muted/40">
            <div className="col-span-3">Invoice & Customer</div>
            <div className="col-span-2 text-center">Date & Status</div>
            <div className="col-span-2 text-center">Items & Qty</div>
            <div className="col-span-2 text-right">Total Amount</div>
            <div className="col-span-3 text-center">Actions</div>
          </div>

          <div className="divide-y divide-border">
            {filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Recycle className="w-12 h-12 mb-3 text-orange-500/30" />
                <p className="font-bold text-foreground text-base">
                  {(invoiceSearch || invoiceDateFrom || invoiceDateTo) ? 'No matching scrap invoices' : 'No scrap invoices found'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(invoiceSearch || invoiceDateFrom || invoiceDateTo) ? 'No invoices match the applied search or date filters' : 'Scrap invoices from billing and purchases will appear here'}
                </p>
              </div>
            ) : (
              filteredInvoices.map((inv: ScrapInvoiceRow, idx: number) => {
                const invDate = formatGroupDate(inv.created_at);
                const prevDate = idx > 0 ? formatGroupDate(filteredInvoices[idx - 1].created_at) : null;
                const showHeader = invDate !== prevDate;
                const units = inv.units || 'Kgs';
                const hasMixedUnits = units.includes(',');
                return (
                  <Fragment key={inv.invoice_number}>
                    {showHeader && (
                      <div className="sticky top-0 z-10 bg-muted px-6 py-1.5 text-xs font-black text-primary uppercase tracking-wider border-b border-border">
                        {invDate}
                      </div>
                    )}
                  <div className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center hover:bg-muted/20 transition-all duration-150 group">
                    {/* Invoice & Customer */}
                    <div className="col-span-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                          <Recycle className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-sm text-foreground truncate">{inv.invoice_number}</span>
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground truncate mt-1">
                        {inv.party_name ? `Customer: ${inv.party_name}` : 'Walk-in Customer'}
                      </div>
                      {(inv.customer_phone || inv.customer_address) && (
                        <div className="text-[10px] text-muted-foreground/60 truncate">
                          {[inv.customer_phone, inv.customer_address].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* Date & Status */}
                    <div className="col-span-2 text-center">
                      <div className="text-xs font-semibold text-foreground">
                        {parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone(), day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      <span className={clsx('inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border',
                        inv.payment_status === 'CREDIT'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          : inv.payment_status === 'PENDING'
                            ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20')}>
                        {inv.payment_status === 'CREDIT' ? 'Credit' : (inv.payment_status || 'PAID')}
                      </span>
                    </div>

                    {/* Items & Qty */}
                    <div className="col-span-2 text-center">
                      <span className="font-bold text-sm text-foreground">{inv.item_count} {inv.item_count === 1 ? 'item' : 'items'}</span>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {hasMixedUnits ? (
                          <span className="italic">Mixed units</span>
                        ) : (
                          <>{Number(inv.total_qty || 0).toFixed(3)} {units}</>
                        )}
                      </div>
                    </div>

                    {/* Total Amount */}
                    <div className="col-span-2 text-right">
                      <span className="text-base font-black text-orange-600 dark:text-orange-400">
                        {formatCurrency(inv.total_amount)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openInvoiceDetail(inv.invoice_number)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-blue-500/20"
                        title="View Invoice Details & Line Items"
                      >
                        <FileText className="w-3.5 h-3.5" /> View
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => handleEditInvoiceInBilling(inv.invoice_number)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-amber-500/20"
                          title="Edit Invoice in Billing Page"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      )}
                      {isOwner && (
                        <button
                          onClick={() => setConfirmDeleteInvoiceNumber(inv.invoice_number)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-all active:scale-95 cursor-pointer border border-destructive/20"
                          title="Delete Invoice"
                        >
                          <Trash className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                  </Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
