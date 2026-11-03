import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import clsx from 'clsx';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { UAE_ARABIC_PRINT_KEY, getUaeArabicPrint, normalizeUaeArabicPrint, setUaeArabicPrint, type UaeArabicPrint } from '../../../utils/print/uaeLabels';

const OPTIONS: Array<{ key: keyof UaeArabicPrint; label: string; hint: string }> = [
  { key: 'documents', label: 'Arabic on A4 / PDF bills, quotations and WhatsApp', hint: 'Prints each label in English and Arabic, e.g. "TAX INVOICE / فاتورة ضريبية".' },
  { key: 'thermal', label: 'Arabic on thermal receipts', hint: 'Turn on only after a test print shows Arabic correctly. Network (IP) printers always print English only.' },
];

/** UAE only: "Arabic on bills". Saved straight away in the `uae_arabic_print` setting, like the LAN pairing key. */
export function UaeArabicPrintSetting() {
  const tenantId = useAuthStore((s) => s.tenantId) || 'global';
  const [value, setValue] = useState<UaeArabicPrint>(getUaeArabicPrint());
  const [error, setError] = useState('');

  useEffect(() => {
    getSetting({ tenant_id: tenantId, key: UAE_ARABIC_PRINT_KEY })
      .then((stored) => setValue(normalizeUaeArabicPrint(stored)))
      .catch(() => setValue(getUaeArabicPrint()));
  }, [tenantId]);

  const toggle = async (key: keyof UaeArabicPrint) => {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setError('');
    try {
      await setSetting({ tenant_id: tenantId, key: UAE_ARABIC_PRINT_KEY, value: next });
      setUaeArabicPrint(next);
    } catch {
      setValue(value);
      setError('Could not save the Arabic print setting. Please try again.');
    }
  };

  return (
    <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
          <Languages className="w-4.5 h-4.5" />
        </div>
        <span className="text-xs font-black text-primary uppercase tracking-widest">Arabic on Bills</span>
      </div>
      <div className="space-y-4">
        {OPTIONS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
            <div className="flex-1">
              <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => void toggle(key)}>{label}</label>
              <p className="text-[10px] text-muted-foreground/75 mt-0.5">{hint}</p>
            </div>
            <button type="button" role="switch" aria-checked={value[key]} aria-label={label} onClick={() => void toggle(key)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', value[key] ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
              <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', value[key] ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        ))}
        {error && <p className="text-[11px] font-semibold text-destructive">{error}</p>}
      </div>
    </div>
  );
}
