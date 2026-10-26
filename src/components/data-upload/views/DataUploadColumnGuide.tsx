import { ListOrdered } from 'lucide-react';
import type { ColumnSpec, UploadEntityType } from '../dataUploadTypes';

export interface DataUploadColumnGuideProps {
  columnSpecs: ColumnSpec[];
  entityType: UploadEntityType;
  onToggleGuide: () => void;
  showOrderGuide: boolean;
}

/** Step 1 card: expected column order and the pricing tier hint. */
export function DataUploadColumnGuide({
  columnSpecs, entityType, onToggleGuide, showOrderGuide,
}: DataUploadColumnGuideProps) {
  return (
    <div className="bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
            1
          </div>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-indigo-600" />
            EXPECTED COLUMN ORDER ({entityType.toUpperCase()})
          </h3>
        </div>
        <button
          onClick={onToggleGuide}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
        >
          {showOrderGuide ? 'Hide Guide' : 'Show Column Guide'}
        </button>
      </div>

      {showOrderGuide && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Arrange your spreadsheet columns in this exact sequence or use matching header titles:
          </p>
          
          <div className="flex flex-wrap gap-2 pt-1">
            {columnSpecs.map((col, idx) => (
              <div
                key={col.name}
                className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-2 shadow-xs transition-all ${
                  col.required
                    ? 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-100 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-sans font-black flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="font-semibold">{col.name}</span>
                {col.required ? (
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 font-sans font-black tracking-wide">
                    REQUIRED
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-sans">
                    Optional
                  </span>
                )}
              </div>
            ))}
          </div>

          {entityType === 'products' && (
            <div className="flex items-start sm:items-center gap-2 p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 text-[11px] text-indigo-950 dark:text-indigo-200 mt-2">
              <span className="font-bold shrink-0 text-indigo-700 dark:text-indigo-300">💡 Pricing Tiers:</span>
              <span>You can add columns for any price tiers (e.g. <code className="font-bold bg-white/80 dark:bg-slate-800 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">Wholesale</code>, <code className="font-bold bg-white/80 dark:bg-slate-800 px-1 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">Dealer</code>, etc.). The system automatically detects and imports them.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
