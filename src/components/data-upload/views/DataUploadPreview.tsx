import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { CheckCircle2, AlertTriangle, Table } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { ParsedRow, UploadEntityType } from '../dataUploadTypes';

export interface DataUploadPreviewProps {
  entityType: UploadEntityType;
  invalidCount: number;
  onClear: () => void;
  parsedRows: ParsedRow[];
  validCount: number;
}

/** Step 4: live preview table with per-row validation status. */
export function DataUploadPreview({
  entityType, invalidCount, onClear, parsedRows, validCount,
}: DataUploadPreviewProps) {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
        <div className="flex items-center gap-3">
          <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase text-xs tracking-wider">
            <Table className="w-4 h-4 text-indigo-600" />
            Live Data Preview ({parsedRows.length} Rows)
          </span>
          <span className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
            ✓ {validCount} Valid
          </span>
          {invalidCount > 0 && (
            <span className="bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 px-2.5 py-0.5 rounded-full font-bold">
              ⚠ {invalidCount} Invalid
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-slate-400 hover:text-slate-600 text-xs font-bold"
        >
          Clear File
        </Button>
      </div>

      {/* Preview Table Container */}
      <div className="max-h-60 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-inner bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-bold">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">Status</th>
              {entityType === 'products' ? (
                <>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">MRP</th>
                  <th className="py-2.5 px-3">Tier Price</th>
                  <th className="py-2.5 px-3">Barcode</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Cost Price</th>
                  <th className="py-2.5 px-3">Stock</th>
                  <th className="py-2.5 px-3">Tax %</th>
                </>
              ) : entityType === 'opening_balances' ? (
                <>
                  <th className="py-2.5 px-3">Account Name</th>
                  <th className="py-2.5 px-3">Balance</th>
                  <th className="py-2.5 px-3">Issue</th>
                </>
              ) : entityType === 'staff' ? (
                <>
                  <th className="py-2.5 px-3">Staff Name</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Role / Designation</th>
                  <th className="py-2.5 px-3">Monthly Salary</th>
                  <th className="py-2.5 px-3">Joining Date</th>
                </>
              ) : (
                <>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Address</th>
                  <th className="py-2.5 px-3">{localizeTaxText("GSTIN")}</th>
                  <th className="py-2.5 px-3">Opening Balance</th>
                  <th className="py-2.5 px-3">Balance Type</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
            {parsedRows.slice(0, 100).map((row) => (
              <tr
                key={row.id}
                className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'bg-rose-50/60 dark:bg-rose-950/40 hover:bg-rose-100/50 text-rose-900 dark:text-rose-200'}
              >
                <td className="py-2 px-3 text-center">
                  {row.isValid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                  ) : (
                    <span title={row.errors.join(', ')}>
                      <AlertTriangle className="w-4 h-4 text-rose-600 inline cursor-pointer animate-pulse" />
                    </span>
                  )}
                </td>
                {entityType === 'products' ? (
                  <>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                    <td className="py-2 px-3 font-bold text-emerald-700 dark:text-emerald-400">{getCurrencyPrefix()}{row.data.base_price ?? 0}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                      {row.data.tier_prices && Object.keys(row.data.tier_prices).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(row.data.tier_prices as Record<string, number>).map(([tName, tPrice]) => (
                            <span
                              key={tName}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                            >
                              {tName}: {getCurrencyPrefix()}{String(tPrice)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.sku_barcode || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.category || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{getCurrencyPrefix()}{row.data.purchase_price ?? 0}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.current_stock ?? 0} {row.data.uom}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.tax_rate_percent}%</td>
                  </>
                ) : entityType === 'opening_balances' ? (
                  <>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                    <td className="py-2 px-3 font-bold text-indigo-700 dark:text-indigo-400">{getCurrencyPrefix()}{row.data.balance ?? 0}</td>
                    <td className="py-2 px-3 text-rose-700 dark:text-rose-300">{row.errors.join(', ')}</td>
                  </>
                ) : entityType === 'staff' ? (
                  <>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.phone || '—'}</td>
                    <td className="py-2 px-3 text-indigo-700 dark:text-indigo-400 font-bold">{row.data.role_designation || 'Staff'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{getCurrencyPrefix()}{row.data.monthly_salary ?? 0}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.joining_date || '—'}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.data.name || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.phone || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400 max-w-[150px] truncate">{row.data.address || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.gstin || '—'}</td>
                    <td className="py-2 px-3 font-bold text-indigo-700 dark:text-indigo-400">{getCurrencyPrefix()}{row.data.balance ?? 0}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.data.balance_type}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {parsedRows.length > 100 && (
          <div className="py-2 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 font-sans">
            Showing first 100 rows out of {parsedRows.length}...
          </div>
        )}
      </div>
    </div>
  );
}
