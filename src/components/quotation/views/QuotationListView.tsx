import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { Search, RefreshCw, Plus, Eye, Pencil, Trash, FileText } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '../../../utils/pricing/money';
import { formatDateLabel, type Quotation } from '../quotationTypes';
import type { QuotationState } from '../hooks/useQuotationState';

export interface QuotationListViewProps {
  filteredQuotations: Quotation[];
  handleCreateNewQuotation: () => void;
  handleDeleteQuotation: (q: Quotation) => void;
  handleEditQuotation: (q: Quotation) => void;
  qm: QuotationState;
  viewQuotation: (q: Quotation) => Promise<void>;
}

/** Quotations list: search and status filters, loading / empty states, and the quotation rows. */
export function QuotationListView({
  filteredQuotations, handleCreateNewQuotation, handleDeleteQuotation, handleEditQuotation, qm, viewQuotation,
}: QuotationListViewProps) {
  const { loading, search, setSearch, statusFilter, setStatusFilter } = qm;
  return (
    <div className="w-full px-4 sm:px-6 pt-4 sm:pt-6 pb-10 space-y-4">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 bg-card border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 lg:p-3.5 shadow-xs">
        <div className="relative flex-1 max-w-full sm:max-w-md lg:max-w-lg">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by quote number, customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 sm:py-2 bg-background border border-border rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-primary transition-all"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'ALL' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'ACTIVE' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('CONVERTED')}
              className={clsx('px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all cursor-pointer', statusFilter === 'CONVERTED' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              Converted
            </button>
          </div>

          <button
            onClick={handleCreateNewQuotation}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> New Quote
          </button>
        </div>
      </div>

      {/* Quotations List */}
      {loading ? (
        <div className="text-center py-16 sm:py-24 text-muted-foreground text-xs sm:text-sm font-bold">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
          Loading quotations...
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="text-center py-12 sm:py-20 bg-card border border-border rounded-xl sm:rounded-2xl p-6 sm:p-10">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-sm sm:text-base font-bold text-foreground">No Quotations Found</h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Create your first quotation or adjust your search filter.</p>
          <button
            onClick={handleCreateNewQuotation}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Create Quotation
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl sm:rounded-2xl overflow-hidden shadow-xs divide-y divide-border">
          {filteredQuotations.map(q => {
            const isGst = q.is_gst === 1 || Number(q.tax_total) > 0;
            return (
              <div
                key={q.quotation_id}
                onClick={() => viewQuotation(q)}
                className="p-3 sm:p-4 lg:p-5 flex items-center justify-between gap-3 sm:gap-4 lg:gap-6 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-xs sm:text-sm text-primary">{q.quotation_number}</span>
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-md border',
                      q.status === 'CONVERTED'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    )}>
                      {q.status === 'CONVERTED' ? 'Converted to Invoice' : 'Active'}
                    </span>
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-md border',
                      isGst ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' : 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                    )}>
                      {localizeTaxText(isGst ? 'GST' : 'Non-GST')}
                    </span>
                  </div>
                  <div className="font-bold text-xs sm:text-sm text-foreground truncate">{q.customer_name || 'Cash Customer'}</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                    {formatDateLabel(q.created_at)}
                    {q.customer_phone ? ` • ${q.customer_phone}` : ''}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-sm sm:text-base lg:text-lg text-foreground">{formatCurrency(q.grand_total)}</div>
                  {Number(q.tax_total) > 0 && (
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground">{localizeTaxText("GST")}: {formatCurrency(q.tax_total)}</div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => viewQuotation(q)}
                    className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {q.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleEditQuotation(q)}
                      className="p-1.5 sm:p-2 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                      title="Edit Quote"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteQuotation(q)}
                    className="p-1.5 sm:p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                    title="Delete Quote"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
