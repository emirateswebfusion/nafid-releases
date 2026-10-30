import { localizeTaxText } from '../../utils/localization/storeProfile';
import clsx from 'clsx';

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
          <span className="text-xs font-bold">{localizeTaxText(opt.label)}</span>
          <span className="text-[10px] opacity-75 mt-0.5">{localizeTaxText(opt.desc)}</span>
        </button>
      ))}
    </div>
  );
}
