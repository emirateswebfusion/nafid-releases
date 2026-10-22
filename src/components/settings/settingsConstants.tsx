import clsx from 'clsx';

export const INDIAN_STATES = [
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'PB', name: 'Punjab' },
  { code: 'BR', name: 'Bihar' },
  { code: 'OD', name: 'Odisha' },
  { code: 'AS', name: 'Assam' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'GA', name: 'Goa' },
];

export const FONT_OPTIONS = [
  { id: 'courier', name: 'Courier New', family: '"Courier New", monospace' },
  { id: 'consolas', name: 'Consolas', family: 'Consolas, monospace' },
  { id: 'lucida', name: 'Lucida Console', family: '"Lucida Console", monospace' },
  { id: 'lucida-sans', name: 'Lucida Sans Typewriter', family: '"Lucida Sans Typewriter", "Lucida Console", monospace' },
  { id: 'monospace', name: 'System Monospace', family: 'monospace' },
] as const;

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function DefaultStockReportViewSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const options = [
    { id: 'estimate', label: 'Estimate Only', desc: 'Non-GST products' },
    { id: 'gst', label: 'GST Only', desc: 'GST enabled products' },
    { id: 'combined', label: 'Estimate & GST', desc: 'All products combined' },
  ] as const;

  return (
    <div className="grid grid-cols-3 gap-x-3">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={clsx(
            'flex flex-col items-center justify-center p-3 text-center rounded-xl border transition-all cursor-pointer',
            value === opt.id
              ? 'bg-primary/10 border-primary text-primary font-extrabold shadow-sm'
              : 'bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
          )}
        >
          <span className="text-xs font-bold">{opt.label}</span>
          <span className="text-[10px] opacity-75 mt-0.5">{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}
