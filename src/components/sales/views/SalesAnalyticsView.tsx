import { StatCard } from './StatCard';
import { IndianRupee, Layers, TrendingUp, Percent, Tag } from 'lucide-react';
import { formatCurrency } from '../../../utils/money';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';

export interface SalesAnalyticsViewProps {
  dailySales: { date: string; sales: number; }[];
  maskedAvgOrder: { displayAmount: number; isHidden: boolean; isMasked: boolean; };
  maskedRevenue: { displayAmount: number; isMasked: boolean; isHidden: boolean; };
  maskedTotalSales: { displayAmount: number; isMasked: boolean; isHidden: boolean; };
  summary: { totalSales: number; totalSalesBeforeDeductions: number; totalInvoices: number; totalTax: number; totalDiscount: number; avgOrder: number; };
}

/** Analytics tab of Sales History: summary stat cards and the daily sales trend chart. */
export function SalesAnalyticsView({
  dailySales, maskedAvgOrder, maskedRevenue, maskedTotalSales, summary,
}: SalesAnalyticsViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
      {/* Top Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          icon={IndianRupee} 
          label="Total Revenue" 
          value={maskedRevenue.isHidden ? '••••••••' : formatCurrency(maskedRevenue.displayAmount)} 
          colorClass="text-emerald-500" 
          bgClass="bg-emerald-500/10" 
          sub={maskedRevenue.isHidden ? 'Protected' : `${summary.totalInvoices} settled invoices`} 
        />
        <StatCard 
          icon={Layers} 
          label="Total Sales" 
          value={maskedTotalSales.isHidden ? '••••••••' : formatCurrency(maskedTotalSales.displayAmount)} 
          colorClass="text-teal-500" 
          bgClass="bg-teal-500/10" 
          sub="Before scrap / returns" 
        />
        <StatCard 
          icon={TrendingUp} 
          label="Avg Order Value" 
          value={maskedAvgOrder.isHidden ? '••••••••' : formatCurrency(maskedAvgOrder.displayAmount)} 
          colorClass="text-blue-500" 
          bgClass="bg-blue-500/10" 
        />
        <StatCard 
          icon={Percent} 
          label="Total GST Tax" 
          value={maskedRevenue.isHidden ? '••••••••' : formatCurrency(summary.totalTax)} 
          colorClass="text-violet-500" 
          bgClass="bg-violet-500/10" 
        />
        {summary.totalDiscount > 0
          ? <StatCard icon={Tag} label="Discounts Given" value={formatCurrency(summary.totalDiscount)} colorClass="text-rose-500" bgClass="bg-rose-500/10" sub="Total savings" />
          : <StatCard icon={Layers} label="Invoices" value={String(summary.totalInvoices)} colorClass="text-amber-500" bgClass="bg-amber-500/10" sub="All time" />
        }
      </div>

      {/* High-Definition Daily Sales Trend Chart */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
          <div>
            <h2 className="text-base font-black text-foreground">Daily Revenue Analytics</h2>
            <p className="text-xs text-muted-foreground font-semibold">Revenue trend over recorded billing dates</p>
          </div>
          <div className="px-3 py-1 rounded-full text-xs font-black bg-primary/10 text-primary border border-primary/20">
            {dailySales.length} Days Recorded
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailySales} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradFull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                axisLine={false} tickLine={false} dy={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 700 }}
                axisLine={false} tickLine={false} width={60}
                tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 14, fontSize: 12, fontWeight: 800,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  padding: '8px 14px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 900, marginBottom: 4 }}
                itemStyle={{ color: 'hsl(var(--primary))' }}
                formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']}
                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone" dataKey="sales"
                stroke="hsl(var(--primary))" strokeWidth={2.5}
                fill="url(#salesGradFull)"
                dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                activeDot={{ r: 7, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
