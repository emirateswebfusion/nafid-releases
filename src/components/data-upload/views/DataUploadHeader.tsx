import { Upload } from 'lucide-react';
import type { UploadEntityType } from '../dataUploadTypes';

export interface DataUploadHeaderProps {
  allowedEntities: UploadEntityType[];
  entityType: UploadEntityType;
  handleEntityChange: (type: UploadEntityType) => void;
  showTabs: boolean;
}

/** Modal header with the entity title and the entity switcher tabs. */
export function DataUploadHeader({
  allowedEntities, entityType, handleEntityChange, showTabs,
}: DataUploadHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
          <Upload className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Import Data ({entityType.toUpperCase()})
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              CSV / EXCEL
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Bulk import spreadsheet records into your POS system in 3 easy steps.
          </p>
        </div>
      </div>

      {showTabs && (
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          {allowedEntities.includes('products') && (
            <button
              onClick={() => handleEntityChange('products')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entityType === 'products'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              📦 Products
            </button>
          )}
          {allowedEntities.includes('customers') && (
            <button
              onClick={() => handleEntityChange('customers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entityType === 'customers'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              👥 Customers
            </button>
          )}
          {allowedEntities.includes('suppliers') && (
            <button
              onClick={() => handleEntityChange('suppliers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entityType === 'suppliers'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              🚚 Suppliers
            </button>
          )}
          {allowedEntities.includes('staff') && (
            <button
              onClick={() => handleEntityChange('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entityType === 'staff'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              👔 Staff
            </button>
          )}
          {allowedEntities.includes('opening_balances') && (
            <button
              onClick={() => handleEntityChange('opening_balances')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entityType === 'opening_balances'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              📒 Opening Balances
            </button>
          )}
        </div>
      )}
    </div>
  );
}
