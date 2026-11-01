import {
  RefreshCw, X, AlertCircle,
  Calendar, Building2, Landmark, FileSpreadsheet, FileCode,
  Layers
} from 'lucide-react';
import clsx from 'clsx';
import { useGstReport, type GstTabType } from './gst/useGstReport';
import { GstSummaryTab } from './gst/GstSummaryTab';
import { GstTablesView } from './gst/GstTablesView';
import { GstValidationTab } from './gst/GstValidationTab';
import { Gstr3bPreparationTab } from './gst/Gstr3bPreparationTab';
import { GstComplianceFilingTab } from './gst/GstComplianceFilingTab';
import { GstIntegrationSettingsTab } from './gst/GstIntegrationSettingsTab';
import { FloatToast } from '../ui/FloatToast';

interface GstReportScreenProps {
  onBack: () => void;
}

export function GstReportScreen({ onBack }: GstReportScreenProps) {
  const {
    isUae,
    shopName,
    shopGstin,
    setShopGstin,
    activeTab,
    setActiveTab,
    loading,
    errorMessage,
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
    fromDate,
    toDate,
    handleRefresh,
    handleExportJson,
    handleExportExcel,
  } = useGstReport();

  // UAE Jurisdictional Notice
  if (isUae) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans select-none animate-in fade-in duration-200">
        <header className="shrink-0 border-b border-border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground">GST Reports &amp; GSTR-1 Filing</h1>
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
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 border border-amber-500/20">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-foreground">Not Applicable for UAE Stores</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            This store is configured for the <strong>United Arab Emirates (UAE)</strong>.
            GSTR-1 statutory filings are specific to Indian GST law. For UAE operations, please use the standard
            Sales History and Financial VAT Audit reports configured for the Federal Tax Authority (FTA).
          </p>
          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                onBack();
                window.dispatchEvent(new CustomEvent('open-vat-reports'));
              }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              Open UAE VAT 201 Return
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl border border-border bg-card text-foreground font-bold text-xs hover:bg-muted transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const periodLabel = periodType === 'month' ? selectedMonth : periodType === 'quarter' ? selectedQuarter : `${fromDate} to ${toDate}`;

  const tabs: Array<{ id: GstTabType; label: string; count?: number; hasAlert?: boolean }> = [
    { id: 'summary', label: 'Executive Summary' },
    { id: 'b2b', label: 'Table 4 (B2B)', count: report?.b2b.length },
    { id: 'b2cl', label: 'Table 5 (B2CL)', count: report?.b2cl.length },
    { id: 'b2cs', label: 'Table 7 (B2CS)', count: report?.b2cs.length },
    { id: 'cdnr', label: 'Table 9B (Notes)', count: (report?.cdnr.length ?? 0) + (report?.cdnur.length ?? 0) },
    { id: 'hsn', label: 'Table 12 (HSN)', count: report?.hsn.length },
    { id: 'doc_issue', label: 'Table 13 (Docs)', count: report?.doc_issue.length },
    { id: 'gstr3b', label: 'GSTR-3B Summary' },
    { 
      id: 'validation', 
      label: 'Audit & Validation', 
      count: report?.validation_issues.length,
      hasAlert: Boolean(report?.validation_issues.some(i => i.severity === 'BLOCKING')),
    },
    { id: 'filing', label: 'Compliance & Filing' },
    { id: 'settings', label: 'GSP Settings' },
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
                  GST Reports &amp; GSTR-1 Filing
                </h1>
              </div>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5 truncate">
                {shopName || 'Store'} • GSTIN:{' '}
                <span className="font-mono font-bold text-foreground">
                  {shopGstin || 'Not set (Update in Settings)'}
                </span>
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="h-9 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Refresh report records"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin text-primary')} />
              <span className="hidden md:inline">Refresh</span>
            </button>

            <button
              onClick={handleExportJson}
              disabled={!report || loading}
              className="h-9 px-3.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Export official JSON payload for GST Offline Tool upload"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Export Portal JSON</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={!report || loading}
              className="h-9 px-3.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Download official multi-tab Excel workbook"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <button
              onClick={onBack}
              className="h-9 w-9 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center justify-center cursor-pointer ml-1"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Period Filter Control Bar */}
        <div className="px-6 py-2.5 border-t border-border/80 bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" /> Filing Period:
            </span>

            {/* Period mode tabs */}
            <div className="flex bg-muted/80 p-0.5 rounded-lg border border-border">
              {(['month', 'quarter', 'custom'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setPeriodType(type)}
                  className={clsx(
                    'px-3 py-1 rounded-md capitalize font-bold text-xs transition-all cursor-pointer',
                    periodType === type ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Month Input */}
            {periodType === 'month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-border bg-background font-mono font-semibold text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}

            {/* Quarter Selector */}
            {periodType === 'quarter' && (
              <div className="flex gap-1">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => (
                  <button
                    key={q}
                    onClick={() => setSelectedQuarter(q)}
                    className={clsx(
                      'px-2.5 py-1 rounded-md font-mono font-bold text-xs border transition-all cursor-pointer',
                      selectedQuarter === q
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                    )}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Custom Date Inputs */}
            {periodType === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-border bg-background font-mono text-xs text-foreground"
                />
                <span className="text-muted-foreground font-semibold">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-border bg-background font-mono text-xs text-foreground"
                />
              </div>
            )}
          </div>

          {/* Active Period Date Pill */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium hidden sm:inline">Active Window:</span>
            <span className="px-2.5 py-1 rounded-lg bg-background font-mono text-xs font-bold text-foreground border border-border">
              {fromDate} → {toDate}
            </span>
          </div>
        </div>

        {/* 3. Section Navigation Tab Bar */}
        <div className="px-6 flex overflow-x-auto border-t border-border bg-card no-scrollbar">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 flex items-center gap-2 transition-all cursor-pointer',
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={clsx(
                      'px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold',
                      tab.hasAlert
                        ? 'bg-destructive/15 text-destructive'
                        : isActive
                        ? 'bg-primary/20 text-primary'
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
      </header>

      {/* 4. Main Scrollable Content Viewport */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 bg-muted/15">
        <div className="w-full">
          {loading ? (
            /* Skeleton Loading State matching KPI cards and tables */
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(idx => (
                  <div key={idx} className="h-28 rounded-2xl bg-card border border-border p-5 flex flex-col justify-between">
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-6 w-32 bg-muted rounded" />
                    <div className="h-2 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
              <div className="h-64 rounded-2xl bg-card border border-border p-6" />
            </div>
          ) : errorMessage ? (
            /* Error State with explicit troubleshooting and retry */
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">Failed to Aggregate GST Records</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {errorMessage}
              </p>
              <button
                onClick={handleRefresh}
                className="mt-5 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs hover:bg-destructive/90 transition-all shadow-xs cursor-pointer"
              >
                Retry Query
              </button>
            </div>
          ) : !report ? (
            /* Empty State */
            <div className="rounded-2xl border border-border bg-card p-12 text-center max-w-md mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">No Records Found</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                No invoices or credit notes match the chosen filing range ({fromDate} to {toDate}).
              </p>
            </div>
          ) : activeTab === 'summary' ? (
            <GstSummaryTab
              report={report}
              shopGstin={shopGstin}
              onNavigateTab={setActiveTab}
              onExportJson={handleExportJson}
              onExportExcel={handleExportExcel}
            />
          ) : activeTab === 'gstr3b' ? (
            <Gstr3bPreparationTab
              report={report}
              shopName={shopName || 'Store'}
              shopGstin={shopGstin}
              onNavigateTab={(tab) => setActiveTab(tab as GstTabType)}
            />
          ) : activeTab === 'validation' ? (
            <GstValidationTab issues={report.validation_issues} />
          ) : activeTab === 'filing' ? (
            <GstComplianceFilingTab
              report={report}
              periodLabel={periodLabel}
              onExportJson={handleExportJson}
              onExportExcel={handleExportExcel}
              shopGstin={shopGstin}
            />
          ) : activeTab === 'settings' ? (
            <GstIntegrationSettingsTab shopGstin={shopGstin} onGstinChange={setShopGstin} />
          ) : (
            <GstTablesView activeTab={activeTab} report={report} />
          )}
        </div>
      </main>

      <FloatToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
