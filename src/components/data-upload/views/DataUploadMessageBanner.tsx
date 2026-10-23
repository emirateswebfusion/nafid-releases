import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface DataUploadMessageBannerProps {
  message: { type: 'success' | 'error' | 'info'; text: string };
  onDismiss: () => void;
}

/** Status banner showing the current success / error / info message. */
export function DataUploadMessageBanner({ message, onDismiss }: DataUploadMessageBannerProps) {
  return (
    <div
      className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between gap-2 shadow-sm ${
        message.type === 'success'
          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200'
          : message.type === 'error'
          ? 'bg-rose-50 text-rose-900 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200'
          : 'bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {message.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
        {message.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
        <span>{message.text}</span>
      </div>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
