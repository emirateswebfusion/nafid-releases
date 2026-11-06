import { Upload, FileSpreadsheet, FileText, FileCheck } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '../../ui/Button';
import type { UploadEntityType } from '../dataUploadTypes';

export interface DataUploadStepsGridProps {
  dragActive: boolean;
  entityType: UploadEntityType;
  fileName: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileUpload: (file: File) => void;
  onDownloadDemo: (format: 'csv' | 'xlsx') => void;
  setDragActive: (active: boolean) => void;
}

/** Step 2 and 3 cards: demo template downloads and the drag-and-drop upload zone. */
export function DataUploadStepsGrid({
  dragActive, entityType, fileName, fileInputRef, handleFileUpload, onDownloadDemo, setDragActive,
}: DataUploadStepsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">

      {/* Left Card: STEP 2 - Download Demo File (50% Width) */}
      <div className="bg-gradient-to-br from-emerald-500/10 via-slate-50 to-indigo-500/10 dark:from-emerald-950/40 dark:via-slate-900 dark:to-indigo-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
              2
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              DOWNLOAD DEMO SAMPLE FILE
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
            Download a pre-filled demo spreadsheet with standard example data to test or copy the exact format for <strong className="uppercase font-black text-emerald-700 dark:text-emerald-400">{entityType}</strong>.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadDemo('xlsx')}
            className="w-full text-xs font-bold flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 border-none shadow-md py-2.5 rounded-xl cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Download Demo Excel (.xlsx)</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadDemo('csv')}
            className="w-full text-xs font-bold flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 py-2.5 rounded-xl cursor-pointer shadow-xs"
          >
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Download Demo CSV (.csv)</span>
          </Button>
        </div>
      </div>

      {/* Right Card: STEP 3 - Upload Spreadsheet (50% Width) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
            3
          </div>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-indigo-600" />
            UPLOAD YOUR SPREADSHEET
          </h3>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[110px] relative ${
            dragActive
              ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/80 scale-[1.01]'
              : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/80'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv, .xlsx, .xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
                e.target.value = '';
              }
            }}
          />

          <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center mb-1.5">
            <Upload className="w-5 h-5" />
          </div>

          <p className="text-xs font-black text-slate-900 dark:text-white">
            Click to browse or drag and drop file here
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Supports CSV (.csv) and Excel (.xlsx, .xls) files up to 10MB
          </p>

          {fileName && (
            <span className="mt-2 text-xs bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 px-3 py-0.5 rounded-full font-bold flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Loaded: {fileName}
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
