import {
  RefreshCw, X, Landmark,
  FileSpreadsheet, FileCode, FileText
} from 'lucide-react';
import clsx from 'clsx';
import { useVatReport, type VatTabType } from './vat/useVatReport';
import { Vat201ReturnTab } from './vat/Vat201ReturnTab';
import { VatEmiratesTab } from './vat/VatEmiratesTab';
import { VatSalesTab } from './vat/VatSalesTab';
import { VatCreditNotesTab } from './vat/VatCreditNotesTab';
import { VatPurchasesTab } from './vat/VatPurchasesTab';
import { VatValidationTab } from './vat/VatValidationTab';
import { VatFilingGuideTab } from './vat/VatFilingGuideTab';
import { FloatToast } from '../ui/FloatToast';

interface VatReportScreenProps {
  onBack: () => void;
}

export function VatReportScreen({ onBack }: VatReportScreenProps) {
  const {
    isUae,
    shopName,
    shopTrn,
    shopEmirate,
    activeTab,
    setActiveTab,
    loading,
    toast,
    setToast,
    report,
    periodType,
    setPeriodType,
    selectedMonth,
    setSelectedMonth,
    selectedQuarter,
    setSelectedQuarter,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filings,
    loadingFilings,
    currentPeriodKey,
    currentFiling,
    handleApproveFiling,
    handleRecordEmaraTaxAck,
    handleRefresh,
    handleExportJson,
    handleExportFaf,
    handleExportExcel,
  } = useVatReport();

  // If opened in an India store, provide a smooth jurisdictional redirect
  if (!isUae) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans select-none animate-in fade-in duration-200">
        <header className="shrink-0 border-b border-border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground">UAE VAT Return 201 &amp; FTA Audit</h1>
                <p className="text-[11px] text-muted-foreground font-medium">Jurisdictional Notice</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="h-8.5 w-8.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-12 text-center max-w-lg mx-auto flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4 border border-teal-500/20">
            <Landmark className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-foreground">Configured for India Operations</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            This store is configured for <strong>India (INR / GST)</strong>. Form VAT 201 filings apply to stores
            operating under the UAE Federal Tax Authority (FTA). For Indian stores, please open the statutory GSTR-1
            Filing engine.
          </p>
          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                onBack();
                window.dispatchEvent(new CustomEvent('open-gst-reports'));
              }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              Open GST Reports (India)
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl border border-border bg-card text-foreground font-bold text-xs hover:bg-muted transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: VatTabType; label: string; count?: number; hasAlert?: boolean }> = [
    { id: 'vat201', label: 'Form VAT 201' },
    { id: 'emirates', label: 'Box 1 Emirates', count: 7 },
    { id: 'sales', label: 'Sales Invoices', count: report?.salesAudit.length },
    { id: 'credit_notes', label: 'Credit Notes', count: report?.creditNotesAudit.length },
    { id: 'purchases', label: 'Purchases (Input Tax)', count: report?.purchaseAudit.length },
    { 
      id: 'validation', 
      label: 'FTA Audit & Compliance', 
      count: report?.validationIssues.length,
      hasAlert: Boolean(report?.validationIssues.some(i => i.severity === 'BLOCKING')),
    },
    {
      id: 'filings_guide',
      label: 'EmaraTax Filing & Guide',
      count: filings.length,
    },
  ];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans select-none overflow-hidden animate-in fade-in duration-200">
      
      {/* 1. Main Header */}
      <header className="shrink-0 border-b border-border bg-card shadow-xs z-30">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 select-none">
          {/* Left: Branding & Title */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 shadow-inner shrink-0">
              <Landmark className="w-5 h-5" />
            </div>

            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-foreground truncate">
                  UAE VAT Return 201 &amp; FTA Audit
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                  Federal Tax Authority (FTA)
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5 truncate">
                {shopName || 'Store'} • TRN:{' '}
                <span className="font-mono font-bold text-foreground">
                  {shopTrn || 'Not set (Update in Settings)'}
                </span>
                {' '}• Emirate: <span className="font-semibold text-foreground">{shopEmirate}</span>
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="h-9 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Refresh VAT records"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin text-primary')} />
              <span className="hidden md:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportFaf}
              disabled={!report || loading}
              className="h-9 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Export official FTA Audit File (FAF)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export FAF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!report || loading}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Export Form VAT 201 multi-sheet Excel workbook"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={!report || loading}
              className="h-9 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Export VAT 201 JSON payload"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>

            <button
              type="button"
              onClick={onBack}
              className="h-9 w-9 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center justify-center cursor-pointer shadow-2xs active:scale-95 ml-1"
              title="Close VAT Reports"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Sub-Header: Period Controls & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-2.5 bg-muted/20 border-t border-border/60">
          {/* Period Mode Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-background border border-border p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setPeriodType('quarter')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  periodType === 'quarter'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Calendar Quarter
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('month')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  periodType === 'month'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('custom')}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  periodType === 'custom'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Custom Date
              </button>
            </div>

            {/* Quarter Selector */}
            {periodType === 'quarter' && (
              <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 shadow-2xs">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuarter(q)}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer',
                      selectedQuarter === q
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Month Picker */}
            {periodType === 'month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-1 text-xs font-semibold rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            )}

            {/* Custom Date Range */}
            {periodType === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
          </div>

          {/* Tab Navigation Pill Bar */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={clsx(
                        'px-1.5 py-0.2 rounded-md text-[10px] font-black font-mono',
                        active
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : tab.hasAlert
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* 3. Screen Body Content */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 bg-background">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="py-24 text-center flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
              <div className="text-sm font-bold text-foreground">Calculating Form VAT 201 Return &amp; Audit Trail...</div>
              <div className="text-xs text-muted-foreground mt-1">
                Aggregating standard rated sales, credit notes, and input tax recovery
              </div>
            </div>
          ) : !report ? (
            <div className="py-24 text-center text-muted-foreground text-sm font-semibold">
              No report available for the selected period.
            </div>
          ) : (
            <>
              {activeTab === 'vat201' && (
                <Vat201ReturnTab 
                  report={report} 
                  onNavigateTab={tab => setActiveTab(tab)} 
                />
              )}
              {activeTab === 'emirates' && <VatEmiratesTab report={report} />}
              {activeTab === 'sales' && <VatSalesTab report={report} />}
              {activeTab === 'credit_notes' && <VatCreditNotesTab report={report} />}
              {activeTab === 'purchases' && <VatPurchasesTab report={report} />}
              {activeTab === 'validation' && <VatValidationTab report={report} />}
              {activeTab === 'filings_guide' && (
                <VatFilingGuideTab
                  report={report}
                  filings={filings}
                  loadingFilings={loadingFilings}
                  currentPeriodKey={currentPeriodKey}
                  currentFiling={currentFiling}
                  onApproveFiling={handleApproveFiling}
                  onRecordEmaraTaxAck={handleRecordEmaraTaxAck}
                />
              )}
            </>
          )}
        </div>
      </main>

      <FloatToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
