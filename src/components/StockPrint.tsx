import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Printer, FileText, Download, X, Package } from 'lucide-react';
import clsx from 'clsx';

interface StockProduct {
  product_id: string;
  name: string;
  category: string;
  grade_name: string;
  grade_rate: number | null;
  current_stock: number;
  average_weight_per_piece: number | null;
  base_price: number;
  pricing_mode: string;
  billing_type: string;
  grade_category: string;
}

type ReportMode = 'summary' | 'detailed';

export function StockPrint({ onClose }: { onClose: () => void }) {
  const { shopName, tenantId } = useAuthStore();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportMode, setReportMode] = useState<ReportMode>('detailed');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.dbGetStockReport(tenantId || '');
        if (Array.isArray(res)) {
          setProducts(res);
        }
      }
    } catch (err) {
      console.error('[StockPrint] Failed to load report:', err);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = printRef.current?.innerHTML || '';
    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try {
          return Array.from(sheet.cssRules || []).map(r => r.cssText).join('');
        } catch { return ''; }
      }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Report - ${shopName}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 0; margin: 0; }
            .report-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .report-header h1 { font-size: 22px; margin: 0; }
            .report-header p { font-size: 13px; color: #666; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #f5f5f5; text-align: left; padding: 8px 6px; border: 1px solid #ddd; font-size: 10px; text-transform: uppercase; }
            td { padding: 6px; border: 1px solid #ddd; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .category-row { background: #e8f0fe; font-weight: bold; }
            .total-row { background: #f0f0f0; font-weight: bold; }
            .summary-card { display: inline-block; margin: 8px; padding: 12px 20px; border: 1px solid #ddd; border-radius: 6px; text-align: center; }
            .summary-card .value { font-size: 20px; font-weight: bold; }
            .summary-card .label { font-size: 10px; color: #666; }
            ${styles}
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const handlePdf = () => {
    handlePrint();
  };

  const totalStock = products.reduce((sum, p) => sum + Number(p.current_stock), 0);
  const totalValue = products.reduce((sum, p) => {
    const rate = p.pricing_mode === 'GRADE_RATE' && p.grade_rate ? Number(p.base_price) + Number(p.grade_rate) : Number(p.base_price);
    return sum + (rate * Number(p.current_stock));
  }, 0);
  const totalProducts = products.length;
  const lowStockItems = products.filter(p => Number(p.current_stock) <= 0).length;

  const groupedByCategory = products.reduce<Record<string, StockProduct[]>>((acc, p) => {
    const cat = p.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const formatCurrency = (amount: number) => `\u20B9${amount.toFixed(2)}`;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Stock Report</h1>
            <p className="text-muted-foreground text-sm">{totalProducts} products | {totalStock.toFixed(0)} total stock</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5 border border-border">
            <button onClick={() => setReportMode('summary')} className={clsx('px-3 py-1.5 text-xs font-bold rounded-md transition-all', reportMode === 'summary' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Summary</button>
            <button onClick={() => setReportMode('detailed')} className={clsx('px-3 py-1.5 text-xs font-bold rounded-md transition-all', reportMode === 'detailed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>Detailed</button>
          </div>
          <button onClick={handlePrint} className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Printer className="w-4 h-4" /> Print</button>
          <button onClick={handlePdf} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 transition-all"><Download className="w-4 h-4" /> PDF</button>
          <button onClick={onClose} className="px-3 py-2 text-xs font-semibold text-red-500 hover:text-red-600 border border-red-200 dark:border-red-900 rounded-lg transition-colors">Close</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">Loading report...</div>
        ) : (
          <div ref={printRef} className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center border-b-2 border-foreground pb-4 mb-4">
              <h1 className="text-2xl font-black">{shopName || 'Shop'}</h1>
              <p className="text-sm text-muted-foreground">Stock Report — {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              <p className="text-xs text-muted-foreground">Generated at {new Date().toLocaleTimeString('en-IN')}</p>
            </div>

            {/* Summary Cards */}
            {reportMode === 'summary' && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 border border-border rounded-xl bg-card">
                  <div className="text-2xl font-black text-primary">{totalProducts}</div>
                  <div className="text-xs text-muted-foreground">Total Products</div>
                </div>
                <div className="text-center p-4 border border-border rounded-xl bg-card">
                  <div className="text-2xl font-black text-primary">{totalStock.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">Total Stock (Pcs)</div>
                </div>
                <div className="text-center p-4 border border-border rounded-xl bg-card">
                  <div className="text-2xl font-black text-emerald-500">{formatCurrency(totalValue)}</div>
                  <div className="text-xs text-muted-foreground">Total Stock Value</div>
                </div>
                <div className="text-center p-4 border border-border rounded-xl bg-card">
                  <div className={clsx('text-2xl font-black', lowStockItems > 0 ? 'text-amber-500' : 'text-emerald-500')}>{lowStockItems}</div>
                  <div className="text-xs text-muted-foreground">Out of Stock Items</div>
                </div>
              </div>
            )}

            {/* Category Summary */}
            {reportMode === 'summary' && (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Category</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Products</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Stock</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(groupedByCategory).map(([cat, items]) => {
                      const catValue = items.reduce((sum, p) => {
                        const rate = p.pricing_mode === 'GRADE_RATE' && p.grade_rate ? Number(p.base_price) + Number(p.grade_rate) : Number(p.base_price);
                        return sum + (rate * Number(p.current_stock));
                      }, 0);
                      const catStock = items.reduce((sum, p) => sum + Number(p.current_stock), 0);
                      return (
                        <tr key={cat} className="hover:bg-muted/20">
                          <td className="p-3 font-semibold">{cat}</td>
                          <td className="p-3 text-right">{items.length}</td>
                          <td className="p-3 text-right">{catStock.toFixed(0)}</td>
                          <td className="p-3 text-right font-bold">{formatCurrency(catValue)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/30 font-bold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right">{totalProducts}</td>
                      <td className="p-3 text-right">{totalStock.toFixed(0)}</td>
                      <td className="p-3 text-right">{formatCurrency(totalValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Detailed Report */}
            {reportMode === 'detailed' && (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Product</th>
                      <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-bold text-xs uppercase text-muted-foreground">Grade</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Stock</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Weight</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Rate</th>
                      <th className="text-right p-3 font-bold text-xs uppercase text-muted-foreground">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(groupedByCategory).map(([cat, items]) => (
                      <>
                        <tr key={cat} className="bg-blue-50/50 dark:bg-blue-950/20">
                          <td colSpan={7} className="p-2.5 font-bold text-sm text-blue-700 dark:text-blue-400">{cat}</td>
                        </tr>
                        {items.map(p => {
                          const rate = p.pricing_mode === 'GRADE_RATE' && p.grade_rate ? Number(p.base_price) + Number(p.grade_rate) : Number(p.base_price);
                          const value = rate * Number(p.current_stock);
                          const totalWeight = p.billing_type === 'WEIGHT' && p.average_weight_per_piece ? Number(p.current_stock) * Number(p.average_weight_per_piece) : 0;
                          return (
                            <tr key={p.product_id} className="hover:bg-muted/20">
                              <td className="p-3 font-medium">{p.name}</td>
                              <td className="p-3 text-muted-foreground">{p.category || '-'}</td>
                              <td className="p-3 text-muted-foreground">{p.grade_name || '-'}</td>
                              <td className="p-3 text-right font-bold">{Number(p.current_stock).toFixed(0)}</td>
                              <td className="p-3 text-right text-muted-foreground">{totalWeight > 0 ? `${totalWeight.toFixed(2)} KG` : '-'}</td>
                              <td className="p-3 text-right">{formatCurrency(rate)}</td>
                              <td className="p-3 text-right font-bold">{formatCurrency(value)}</td>
                            </tr>
                          );
                        })}
                      </>
                    ))}
                    <tr className="bg-muted/30 font-bold">
                      <td colSpan={3} className="p-3">Grand Total</td>
                      <td className="p-3 text-right">{totalStock.toFixed(0)}</td>
                      <td className="p-3 text-right"></td>
                      <td className="p-3 text-right"></td>
                      <td className="p-3 text-right">{formatCurrency(totalValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border">
              Generated by Vendora POS — {new Date().toLocaleString('en-IN')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
