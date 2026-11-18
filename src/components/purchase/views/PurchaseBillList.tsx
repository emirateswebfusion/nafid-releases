import { getCurrencyPrefix, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import React, { Fragment } from 'react';
import { Search, X, Download, Plus, Receipt, FileText, User, Calendar, Printer, Pencil, Trash, Eye, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { DateRangeFilter } from '../../ui/DateRangeFilter';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import { formatDate, purchaseBillTypeLabel } from '../purchaseFormat';
import type { PurchaseBill, PurchaseBillItem } from '../purchaseTypes';

export interface PurchaseBillListProps {
  bills: PurchaseBill[];
  billSummaries: Record<string, { totalQty: number; cgst: number; sgst: number; taxableAmount: number; itemsCount: number; hasPaper?: boolean; isAllPaper?: boolean; }>;
  dateFrom: string;
  dateTo: string;
  filteredBills: PurchaseBill[];
  filterType: "ALL" | "GST" | "ESTIMATE" | "PAPER";
  handleDelete: (bill: PurchaseBill) => void;
  handleEditBill: (bill: PurchaseBill) => Promise<void>;
  handleExportCSV: () => Promise<void>;
  handlePrintBill: (billToPrint: PurchaseBill, itemsToPrint?: PurchaseBillItem[]) => Promise<void>;
  handleViewBill: (bill: PurchaseBill) => Promise<void>;
  isExporting: boolean;
  loading: boolean;
  searchQuery: string;
  setDateFrom: React.Dispatch<React.SetStateAction<string>>;
  setDateTo: React.Dispatch<React.SetStateAction<string>>;
  setEditHasItems: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingBill: React.Dispatch<React.SetStateAction<PurchaseBill | null>>;
  setEstHasItems: React.Dispatch<React.SetStateAction<boolean>>;
  setFilterType: React.Dispatch<React.SetStateAction<"ALL" | "GST" | "ESTIMATE" | "PAPER">>;
  setGstHasItems: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowAddForm: React.Dispatch<React.SetStateAction<boolean>>;
  showAddForm: boolean;
  viewingBill: PurchaseBill | null;
  isResyncing?: boolean;
  onResyncPurchases?: () => void;
}

/** Purchase bill list: filters (type, search), summary, and the bills table with view / edit / print / delete actions. */
export function PurchaseBillList({
  bills, billSummaries, dateFrom, dateTo, filteredBills, filterType, handleDelete, handleEditBill, handleExportCSV,
  handlePrintBill, handleViewBill, isExporting, loading, searchQuery, setDateFrom, setDateTo, setEditHasItems,
  setEditingBill, setEstHasItems, setFilterType, setGstHasItems, setSearchQuery, setShowAddForm, showAddForm,
  viewingBill, isResyncing, onResyncPurchases,
}: PurchaseBillListProps) {
  return (
    <>
    <div className="w-full px-4 sm:px-6 pt-6 select-none shrink-0">
      <div className="flex flex-wrap gap-3 items-center bg-card border border-border rounded-[28px] shadow-sm p-4 sm:px-6 select-none">
        {/* Search */}
      <div className="relative min-w-[180px] w-full sm:w-auto flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
        <Input
          aria-label="Search bills or suppliers"
          type="text"
          placeholder="Search bill or supplier..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 pr-8"
        />
        {searchQuery && (
          <Button variant="ghost" size="icon"
            aria-label="Clear bill search"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Bill type and date filters */}
      <div className="flex shrink-0 items-center gap-3 flex-wrap">
        <Select
          aria-label="Bill type"
          value={filterType}
          onChange={type => {
            if (type === 'ALL' || type === 'GST' || type === 'ESTIMATE' || type === 'PAPER') setFilterType(type);
          }}
          className="w-44"
          options={(['ALL', 'GST', 'ESTIMATE', 'PAPER'] as const).map(type => {
            const count = type === 'ALL' ? bills.length : type === 'PAPER'
              ? bills.filter(b => billSummaries[b.purchase_bill_id]?.hasPaper).length
              : bills.filter(b => b.bill_type === type).length;
            const label = type === 'ALL' ? 'All Types' : type === 'GST' ? 'GST Only' : type === 'ESTIMATE' ? 'Estimate Only' : 'Paper Only';
            return { value: type, label: `${label}${loading ? '' : ` (${count})`}` };
          })}
        />

        <DateRangeFilter triggerClassName="h-10 px-3 whitespace-nowrap text-xs bg-background" startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        {onResyncPurchases && (
          <Button
            onClick={onResyncPurchases}
            disabled={isResyncing}
            title="Force refresh / download purchase bills from cloud"
            variant="outline" className="h-10 shrink-0 gap-1.5 px-4"
          >
            <RefreshCw className={clsx("w-4 h-4 shrink-0", isResyncing && "animate-spin text-primary")} />
            <span className="hidden sm:inline">{isResyncing ? 'Syncing...' : 'Re-sync'}</span>
          </Button>
        )}
        {/* Export Button */}
        {!showAddForm && filteredBills.length > 0 && (
          <Button
            onClick={handleExportCSV}
            disabled={isExporting}
            title={`Export ${filteredBills.length} filtered bill${filteredBills.length !== 1 ? 's' : ''} to CSV`}
            variant="outline" className="h-10 shrink-0 gap-1.5 px-5"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Export</span>
          </Button>
        )}

        {/* New Bill Button */}
        <Button
          onClick={() => { setShowAddForm(true); setEditingBill(null); setEditHasItems(false); setGstHasItems(false); setEstHasItems(false); }}
          className="h-10 shrink-0 gap-1.5 px-5"
        >
          <Plus className="w-4 h-4 shrink-0" /> New Bill
        </Button>
      </div>
    </div>
    </div>

    <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 pt-3 bg-muted/[0.02] w-full select-none flex flex-col min-h-0 bg-background">
      <div className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm flex-1 flex flex-col min-h-0 bg-card border border-border rounded-[28px] overflow-hidden shadow-sm">
        <div className="flex-1 overflow-y-auto">
          <div className="min-w-0 overflow-x-auto">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-9 gap-3 px-6 md:px-8 py-3.5 bg-muted/20 dark:bg-muted/10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border select-none">
        <div className="col-span-2 text-left">Bill No</div>
        <div className="col-span-2 text-center">Supplier</div>
        <div className="col-span-1 text-center">Inv No</div>
        <div className="col-span-1 text-center">Bill Date</div>
        <div className="col-span-1 text-center">Items</div>
        <div className="col-span-1 text-right">Amount</div>
        <div className="col-span-1" />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border relative">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`skel-${i}`} className="grid grid-cols-9 gap-3 px-8 py-5 items-center">
              <div className="col-span-2 flex justify-start">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </div>
              <div className="col-span-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
              <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-14" /></div>
              <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-16" /></div>
              <div className="col-span-1 flex justify-center"><Skeleton className="h-4 w-14" /></div>
              <div className="col-span-1 flex justify-end"><Skeleton className="h-5 w-16" /></div>
              <div className="col-span-1 flex justify-center gap-1">
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
              </div>
            </div>
          ))
        ) : filteredBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
            <Receipt className="w-16 h-16 mb-4 opacity-40" />
            <p className="font-semibold text-foreground text-lg">
              {filterType === 'ALL'
                ? 'No purchase bills found'
                : filterType === 'PAPER'
                ? 'No paper purchase bills found'
                : `No ${filterType === 'GST' ? 'GST' : 'Estimate'} bills found`}
            </p>
            <p className="text-sm mt-1">
              {filterType !== 'ALL' ? `Try switching to "All" to see all bills` : 'Click "New Purchase Bill" to record a purchase entry'}
            </p>
          </div>
        ) : (
          filteredBills.map(bill => (
            <Fragment key={bill.purchase_bill_id}>
              <div
                onClick={() => handleViewBill(bill)}
                className={clsx(
                  "border-b border-border last:border-b-0 transition-all duration-200 hover:bg-muted/10 grid grid-cols-9 gap-3 px-8 py-4.5 items-center bg-card cursor-pointer group",
                  viewingBill?.purchase_bill_id === bill.purchase_bill_id && "bg-primary/[0.03] border-l-2 border-l-primary"
                )}
              >
                <div className="col-span-2 flex items-center gap-2.5 text-left">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground font-bold text-sm truncate">{bill.bill_number}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {bill.bill_type && (
                        <span className={clsx(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0",
                          bill.bill_type === 'ESTIMATE'
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        )}>
                          {purchaseBillTypeLabel(bill)}
                        </span>
                      )}
                      {billSummaries[bill.purchase_bill_id]?.isAllPaper && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                          📄 Paper
                        </span>
                      )}
                      {!billSummaries[bill.purchase_bill_id]?.isAllPaper && billSummaries[bill.purchase_bill_id]?.hasPaper && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                          📄 Has Paper
                        </span>
                      )}
                      {bill.payment_type && bill.payment_type !== 'CASH' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                          {bill.payment_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold text-foreground truncate">{bill.supplier_name}</span>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  {bill.invoice_number ? (
                    <span className="text-[11px] font-semibold text-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded-lg border border-border/30">
                      {bill.invoice_number}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/30 font-bold text-xs">—</span>
                  )}
                </div>
                <div className="col-span-1 flex items-center justify-center gap-1 text-sm font-medium text-muted-foreground">
                  <Calendar className="w-3 h-3 text-primary/60 shrink-0" />
                  <span className="text-[11px]">{formatDate(bill.bill_date || bill.created_at)}</span>
                </div>
                <div className="col-span-1 flex flex-col items-center justify-center leading-tight">
                  {(() => {
                    const s = billSummaries[bill.purchase_bill_id];
                    if (!s) return <span className="text-muted-foreground/30 text-xs">—</span>;
                    return (
                      <>
                        <span className="text-xs font-bold text-foreground">{s.itemsCount} item{s.itemsCount !== 1 ? 's' : ''}</span>
                        <span className="text-[10px] text-muted-foreground font-semibold">Qty: {s.totalQty.toFixed(2)}</span>
                      </>
                    );
                  })()}
                </div>

                <div className="col-span-1 text-right">
                  <span className="text-sm font-black text-foreground">{getCurrencyPrefix()}{Number(bill.total_amount).toFixed(getCurrencyDecimals())}</span>
                </div>
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); handlePrintBill(bill); }}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground/40 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="Print Bill"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleEditBill(bill); }}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="Edit Bill"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(bill); }}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete Bill"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleViewBill(bill); }}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-150 cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
                    title="View Bill Details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Fragment>
          ))
        )}
      </div>

      {!loading && bills.length > 0 && (
        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-4 text-center text-sm font-bold text-muted-foreground">
          {bills.length} purchase bill{bills.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
    </div>
    </div>
    </div>
    </>
  );
}
