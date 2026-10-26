import { AlertTriangle } from 'lucide-react';
import { formatBusinessDate } from '../cashierFormat';

interface PreviousDrawerOpenBannerProps {
  businessDate: string;
}

export function PreviousDrawerOpenBanner({ businessDate }: PreviousDrawerOpenBannerProps) {
  return (
    <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-6 py-2.5 flex items-center gap-3">
      <div className="p-1.5 rounded-full bg-amber-500/20 shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
      </div>
      <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
        This drawer is from {formatBusinessDate(businessDate)} and is still open. Close it to start today's drawer.
      </p>
    </div>
  );
}
