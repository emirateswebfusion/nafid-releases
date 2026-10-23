import { RefreshCw, Upload } from 'lucide-react';
import { Button } from '../../ui/Button';

export interface DataUploadFooterProps {
  importing: boolean;
  onCancel: () => void;
  onImport: () => void;
  validCount: number;
}

/** Footer actions: cancel and import the valid rows. */
export function DataUploadFooter({ importing, onCancel, onImport, validCount }: DataUploadFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
      <Button variant="ghost" onClick={onCancel} disabled={importing} className="font-bold text-xs">
        Cancel
      </Button>

      <Button
        onClick={onImport}
        disabled={importing || validCount === 0}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
      >
        {importing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Importing {validCount} Records...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Import {validCount} Valid Records
          </>
        )}
      </Button>
    </div>
  );
}
