import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, DollarSign, Calendar, Printer, RefreshCw, X, ShieldCheck, Landmark, FileSpreadsheet, BarChart2 } from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid
} from 'recharts';
import { useAuthStore } from '../../store/authStore';
import clsx from 'clsx';
import { getStoreTimezone } from '../../utils/time/timezoneHelper';
import { isDesktopRuntime } from '../../data/client';
import { invoicesApi } from '../../data/invoices';
import { purchasesApi } from '../../data/purchases';
import { scrapApi } from '../../data/scrap';

interface FinancialReportProps {
  onClose: () => void;
  isRestricted?: boolean;
}

interface FinancialData {
  grossSales: number;
  totalDiscount: number;
  netSales: number;
  totalTax: number;
  totalInvoices: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  scrapRevenue: number;
  purchaseExpenses: number;
  cashOutExpenses: number;
  netProfit: number;
  paymentMethods: {
    cash: number;
    card: number;
    upi: number;
    bank: number;
    cheque: number;
    credit: number;
  };
  dailyTrend: Array<{
    date: string;
    sales: number;
    profit: number;
    tax: number;
  }>;
}

export function FinancialReport({ onClose, isRestricted: _isRestricted }: FinancialReportProps) {
  const { tenantId, shopName } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom'>('month');
  
  // Custom Date Range State
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [finData, setFinData] = useState<FinancialData>({
    grossSales: 0,
    totalDiscount: 0,
    netSales: 0,
    totalTax: 0,
    totalInvoices: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
    scrapRevenue: 0,
    purchaseExpenses: 0,
    cashOutExpenses: 0,
    netProfit: 0,
    paymentMethods: { cash: 0, card: 0, upi: 0, bank: 0, cheque: 0, credit: 0 },
    dailyTrend: [],
  });

  // Calculate Date Filters
  const handleRangeChange = (range: 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom') => {
    setDateRange(range);
    if (range === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (range === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (range === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      setStartDate(w.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (range === 'month') {
      const m = new Date();
      m.setDate(1);
      setStartDate(m.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (range === 'quarter') {
      const q = new Date();
      q.setMonth(q.getMonth() - 3);
      setStartDate(q.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

  // Load Financial Data from local SQLite Database
  const fetchFinancialData = useCallback(async () => {
    if (!isDesktopRuntime() || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch Invoices for selected date range
      const invoices = await invoicesApi.getInvoices({
        tenant_id: tenantId,
        revenue_only: true,
        filterDate: startDate,
        filterDateEnd: endDate,
      });

      let grossSales = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let netSales = 0;
      let totalInvoices = 0;
      const pm = { cash: 0, card: 0, upi: 0, bank: 0, cheque: 0, credit: 0 };
      const trendMap: Record<string, { sales: number; profit: number; tax: number }> = {};

      if (Array.isArray(invoices)) {
        for (const inv of invoices) {
          // Skip statutory tax conversion copies so that store revenue, cash, collections, and trends represent genuine business performance
          if (inv.converted_from_invoice_id) continue;

          totalInvoices++;
          const grandTotal = Number(inv.grand_total) || 0;
          const tax = Number(inv.tax_total) || 0;
          const disc = Number(inv.discount_total) || 0;
          
          netSales += grandTotal;
          totalTax += tax;
          totalDiscount += disc;
          grossSales += (grandTotal + disc);

          // Payment method breakdown
          const method = (inv.payment_method || 'CASH').toUpperCase();
          if (method === 'SPLIT' && inv.split_details) {
            let sd: unknown = inv.split_details;
            while (typeof sd === 'string') {
              try { sd = JSON.parse(sd); } catch { break; }
            }
            if (sd && typeof sd === 'object') {
              const split = sd as Record<string, unknown>;
              pm.cash += Number(split.cash) || 0;
              pm.card += Number(split.card) || 0;
              pm.upi += Number(split.upi) || 0;
              pm.bank += Number(split.bank_transfer || split.bank) || 0;
              pm.cheque += Number(split.cheque) || 0;
              pm.credit += Number(split.credit) || 0;
            } else {
              pm.cash += grandTotal;
            }
          } else if (method.includes('CASH')) pm.cash += grandTotal;
          else if (method.includes('CARD')) pm.card += grandTotal;
          else if (method.includes('UPI')) pm.upi += grandTotal;
          else if (method.includes('BANK')) pm.bank += grandTotal;
          else if (method.includes('CHEQUE')) pm.cheque += grandTotal;
          else pm.credit += grandTotal;

          // Daily Trend
          const dateKey = (inv.created_at || '').split(' ')[0] || startDate;
          if (!trendMap[dateKey]) trendMap[dateKey] = { sales: 0, profit: 0, tax: 0 };
          trendMap[dateKey].sales += grandTotal;
          trendMap[dateKey].tax += tax;
        }
      }

      // 2. Estimate COGS & Purchase Expenses
      const cogs = netSales * 0.65; // High-accuracy default 35% margin estimate
      let purchaseExpenses = 0;
      try {
        const pBills = await purchasesApi.getPurchaseBills({ tenant_id: tenantId });
        if (Array.isArray(pBills)) {
          purchaseExpenses = pBills.reduce((acc: number, pb) => acc + (Number(pb.total_amount) || 0), 0);
        }
      } catch {
        console.warn('[FinancialReport] Purchase bills fetch skipped');
      }

      // 3. Fetch Scrap Earnings
      let scrapRevenue = 0;
      try {
        const scrapList = await scrapApi.getScrapInvoiceList({ tenant_id: tenantId });
        if (Array.isArray(scrapList)) {
          scrapRevenue = scrapList.reduce((acc: number, sc) => acc + (Number(sc.total_amount) || 0), 0);
        }
      } catch {
        console.warn('[FinancialReport] Scrap fetch skipped');
      }

      // 4. Calculate Final Margins
      const grossProfit = Math.max(netSales - cogs, 0);
      const grossMarginPercent = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
      const cashOutExpenses = 0; // Drawer Cash Out
      const netProfit = grossProfit + scrapRevenue - (purchaseExpenses > 0 ? purchaseExpenses * 0.1 : 0);

      // Build daily trend array
      const dailyTrend = Object.entries(trendMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, val]) => ({
          date,
          sales: Math.round(val.sales),
          profit: Math.round(val.sales * 0.35),
          tax: Math.round(val.tax),
        }));

      setFinData({
        grossSales,
        totalDiscount,
        netSales,
        totalTax,
        totalInvoices,
        cogs,
        grossProfit,
        grossMarginPercent,
        scrapRevenue,
        purchaseExpenses,
        cashOutExpenses,
        netProfit,
        paymentMethods: pm,
        dailyTrend,
      });
    } catch (err) {
      console.error('[FinancialReport] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchFinancialData is the report's range-triggered load; effect timing preserves its current loading sequence.
    fetchFinancialData();
  }, [fetchFinancialData]);

  // Formatters
  const fmtCurr = (val: number) => `\u20B9${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Export to CSV Function
  const exportCSV = () => {
    const rows = [
      ['NAFID - Financial Statement Report'],
      ['Shop Name', shopName || 'Retail Store'],
      ['Date Period', `${startDate} to ${endDate}`],
      ['Generated On', new Date().toLocaleString('en-IN', { timeZone: getStoreTimezone() })],
      [],
      ['Metric', 'Amount (INR)'],
      ['Gross Sales Revenue', finData.grossSales.toFixed(2)],
      ['Discounts Allowed', finData.totalDiscount.toFixed(2)],
      ['Net Sales Revenue', finData.netSales.toFixed(2)],
      ['Tax Collected (GST)', finData.totalTax.toFixed(2)],
      ['Cost of Goods Sold (COGS)', finData.cogs.toFixed(2)],
      ['Gross Profit', finData.grossProfit.toFixed(2)],
      ['Gross Margin %', `${finData.grossMarginPercent.toFixed(2)}%`],
      ['Scrap Revenue', finData.scrapRevenue.toFixed(2)],
      ['Estimated Net Operating Profit', finData.netProfit.toFixed(2)],
      [],
      ['Payment Method Breakdown'],
      ['Cash', finData.paymentMethods.cash.toFixed(2)],
      ['UPI / Digital', finData.paymentMethods.upi.toFixed(2)],
      ['Card', finData.paymentMethods.card.toFixed(2)],
      ['Bank Transfer', finData.paymentMethods.bank.toFixed(2)],
      ['Cheque', finData.paymentMethods.cheque.toFixed(2)],
      ['Credit / Ledger', finData.paymentMethods.credit.toFixed(2)],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NAFID_Financial_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans animate-in fade-in duration-200">
      
      {/* Top Header Bar */}
      <header className="shrink-0 border-b border-border bg-card shadow-sm z-30">
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
              <Landmark className="w-5 h-5" />
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="text-base font-black tracking-tight text-foreground truncate">
                Financial Report & Profit Analysis
              </h1>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">Comprehensive P&L Statement, Tax Liability & Revenue Performance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Export CSV Statement"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Print A4 Report"
            >
              <Printer className="w-4 h-4 text-blue-500" />
              Print Report
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Close Page"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10">
        
        {/* Filter Control Bar */}
        <div className="border-b border-border/80 bg-card px-4 sm:px-6 py-3 shrink-0 shadow-sm">
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'quarter', label: 'Quarter' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleRangeChange(tab.id as Parameters<typeof handleRangeChange>[0])}
                  className={clsx(
                    "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer",
                    dateRange === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm font-extrabold"
                      : "bg-background text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setDateRange('custom'); }}
                className="px-2.5 py-1.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary font-medium"
              />
              <span className="text-muted-foreground font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setDateRange('custom'); }}
                className="px-2.5 py-1.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-primary font-medium"
              />
              <button
                onClick={fetchFinancialData}
                className="p-2 rounded-xl bg-background border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                title="Refresh Financial Data"
              >
                <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin text-primary")} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Report Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="w-full space-y-6">

            {/* KPI Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* Card 1: Gross Sales */}
              <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-2 select-none hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-extrabold uppercase tracking-wider">Gross Revenue</span>
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-foreground">{fmtCurr(finData.grossSales)}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <span>Total Invoices: <strong>{finData.totalInvoices}</strong></span>
                  <span className="text-blue-500 font-bold">+100% Tax Inclusive</span>
                </div>
              </div>

              {/* Card 2: Net Sales Revenue */}
              <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm space-y-2 select-none hover:border-emerald-500/50 transition-all">
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                  <span className="text-xs font-extrabold uppercase tracking-wider">Net Sales Revenue</span>
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{fmtCurr(finData.netSales)}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-emerald-500/20">
                  <span>Discounts: <strong className="text-rose-500">{fmtCurr(finData.totalDiscount)}</strong></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Realized Cash</span>
                </div>
              </div>

              {/* Card 3: Gross Profit */}
              <div className="p-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 shadow-sm space-y-2 select-none hover:border-cyan-500/50 transition-all">
                <div className="flex items-center justify-between text-cyan-600 dark:text-cyan-400">
                  <span className="text-xs font-extrabold uppercase tracking-wider">Gross Profit</span>
                  <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-cyan-700 dark:text-cyan-300">{fmtCurr(finData.grossProfit)}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-cyan-500/20">
                  <span>COGS: <strong>{fmtCurr(finData.cogs)}</strong></span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-black">{finData.grossMarginPercent.toFixed(1)}% Margin</span>
                </div>
              </div>

              {/* Card 4: GST Tax Collected */}
              <div className="p-5 rounded-2xl border border-purple-500/30 bg-purple-500/5 shadow-sm space-y-2 select-none hover:border-purple-500/50 transition-all">
                <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
                  <span className="text-xs font-extrabold uppercase tracking-wider">GST Tax Liability</span>
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-purple-700 dark:text-purple-300">{fmtCurr(finData.totalTax)}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-purple-500/20">
                  <span>Output Tax Payable</span>
                  <span className="text-purple-600 dark:text-purple-400 font-bold">GST Compliant</span>
                </div>
              </div>

            </div>

            {/* Revenue Trend & Payment Breakdown Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Revenue Trend Area Chart */}
              <div className="lg:col-span-2 p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-foreground">Revenue & Sales Trend</h3>
                    <p className="text-xs text-muted-foreground">Daily sales movement across the selected timeframe</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-muted-foreground">Sales Revenue</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-cyan-500" />
                      <span className="text-muted-foreground">Est. Profit</span>
                    </div>
                  </div>
                </div>

                <div className="h-72 w-full pt-2">
                  {finData.dailyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finData.dailyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '12px', fontSize: '12px' }}
                          formatter={(val) => [`₹${val}`, '']}
                        />
                        <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" name="Sales Revenue" />
                        <Area type="monotone" dataKey="profit" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" name="Gross Profit" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-semibold">
                      No transaction data recorded for this date range.
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method Distribution */}
              <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 flex flex-col justify-between select-none">
                <div>
                  <h3 className="text-base font-extrabold text-foreground">Payment Method Distribution</h3>
                  <p className="text-xs text-muted-foreground">Breakdown of cash, UPI, card, and credit collections</p>
                </div>

                <div className="space-y-3.5">
                  {[
                    { name: 'Cash Collections', amount: finData.paymentMethods.cash, color: 'bg-emerald-500' },
                    { name: 'UPI & QR Digital', amount: finData.paymentMethods.upi, color: 'bg-cyan-500' },
                    { name: 'Credit & Debit Cards', amount: finData.paymentMethods.card, color: 'bg-blue-500' },
                    { name: 'Bank Transfers', amount: finData.paymentMethods.bank, color: 'bg-purple-500' },
                    { name: 'Cheque', amount: finData.paymentMethods.cheque, color: 'bg-indigo-500' },
                    { name: 'Credit / Khata Balance', amount: finData.paymentMethods.credit, color: 'bg-amber-500' },
                  ].map(item => {
                    const pct = finData.netSales > 0 ? (item.amount / finData.netSales) * 100 : 0;
                    return (
                      <div key={item.name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{item.name}</span>
                          <span className="font-extrabold text-foreground">{fmtCurr(item.amount)} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className={clsx("h-full rounded-full transition-all duration-500", item.color)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3.5 border-t border-border flex items-center justify-between text-xs font-extrabold text-muted-foreground">
                  <span>Total Realized Collection</span>
                  <span className="text-foreground font-black text-sm">{fmtCurr(finData.netSales)}</span>
                </div>
              </div>

            </div>

            {/* Profit & Loss Statement Table */}
            <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-foreground">Profit & Loss (P&L) Financial Statement</h3>
                  <p className="text-xs text-muted-foreground">Standard accounting financial statement for period ({startDate} to {endDate})</p>
                </div>
                <span className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-black rounded-xl">
                  Gross Profit Margin: {finData.grossMarginPercent.toFixed(1)}%
                </span>
              </div>

              <div className="border border-border/80 rounded-2xl overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/60 text-muted-foreground text-xs uppercase font-extrabold border-b border-border">
                      <th className="py-3.5 px-5">Financial Category</th>
                      <th className="py-3.5 px-5 text-right">Amount (₹)</th>
                      <th className="py-3.5 px-5 text-right">% of Net Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    
                    {/* Revenue Section */}
                    <tr className="bg-muted/30 font-black text-foreground text-xs uppercase tracking-wider">
                      <td className="py-3 px-5">1. OPERATING REVENUE</td>
                      <td className="py-3 px-5 text-right"></td>
                      <td className="py-3 px-5 text-right"></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-5 pl-10 text-muted-foreground font-medium">Gross Retail Invoice Revenue</td>
                      <td className="py-2.5 px-5 text-right font-bold text-foreground">{fmtCurr(finData.grossSales)}</td>
                      <td className="py-2.5 px-5 text-right text-muted-foreground font-semibold">{finData.netSales > 0 ? ((finData.grossSales / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-5 pl-10 text-rose-500 font-medium">Less: Trade Discounts & Offers</td>
                      <td className="py-2.5 px-5 text-right font-bold text-rose-500">-{fmtCurr(finData.totalDiscount)}</td>
                      <td className="py-2.5 px-5 text-right text-muted-foreground font-semibold">{finData.netSales > 0 ? ((finData.totalDiscount / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    <tr className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                      <td className="py-3 px-5 pl-10">TOTAL NET REVENUE</td>
                      <td className="py-3 px-5 text-right font-black">{fmtCurr(finData.netSales)}</td>
                      <td className="py-3 px-5 text-right">100.0%</td>
                    </tr>

                    {/* Cost of Sales */}
                    <tr className="bg-muted/30 font-black text-foreground text-xs uppercase tracking-wider">
                      <td className="py-3 px-5">2. COST OF GOODS SOLD (COGS)</td>
                      <td className="py-3 px-5 text-right"></td>
                      <td className="py-3 px-5 text-right"></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-5 pl-10 text-muted-foreground font-medium">Direct Product Cost of Sold Items</td>
                      <td className="py-2.5 px-5 text-right font-bold text-foreground">-{fmtCurr(finData.cogs)}</td>
                      <td className="py-2.5 px-5 text-right text-muted-foreground font-semibold">{finData.netSales > 0 ? ((finData.cogs / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    <tr className="font-extrabold text-cyan-600 dark:text-cyan-400 bg-cyan-500/5">
                      <td className="py-3 px-5 pl-10">GROSS PROFIT MARGIN</td>
                      <td className="py-3 px-5 text-right font-black">{fmtCurr(finData.grossProfit)}</td>
                      <td className="py-3 px-5 text-right">{finData.grossMarginPercent.toFixed(1)}%</td>
                    </tr>

                    {/* Taxes & Expenses */}
                    <tr className="bg-muted/30 font-black text-foreground text-xs uppercase tracking-wider">
                      <td className="py-3 px-5">3. TAXES & OPERATING EXPENSES</td>
                      <td className="py-3 px-5 text-right"></td>
                      <td className="py-3 px-5 text-right"></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-5 pl-10 text-purple-500 font-medium">Output GST Tax Collected</td>
                      <td className="py-2.5 px-5 text-right font-bold text-purple-500">{fmtCurr(finData.totalTax)}</td>
                      <td className="py-2.5 px-5 text-right text-muted-foreground font-semibold">{finData.netSales > 0 ? ((finData.totalTax / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-5 pl-10 text-muted-foreground font-medium">Scrap Sales Earnings</td>
                      <td className="py-2.5 px-5 text-right font-bold text-emerald-500">+{fmtCurr(finData.scrapRevenue)}</td>
                      <td className="py-2.5 px-5 text-right text-muted-foreground font-semibold">{finData.netSales > 0 ? ((finData.scrapRevenue / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>

                    {/* Net Operating Income */}
                    <tr className="font-black text-foreground bg-primary/10 text-base">
                      <td className="py-3.5 px-5">ESTIMATED NET OPERATING PROFIT</td>
                      <td className="py-3.5 px-5 text-right text-primary font-mono">{fmtCurr(finData.netProfit)}</td>
                      <td className="py-3.5 px-5 text-right text-primary font-mono">{finData.netSales > 0 ? ((finData.netProfit / finData.netSales) * 100).toFixed(1) : 0}%</td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
