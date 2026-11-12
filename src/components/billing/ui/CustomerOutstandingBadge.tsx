import { getStoreLocale, getCurrencyDecimals } from '../../../utils/localization/storeProfile';
import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

export function CustomerOutstandingBadge({ partyObj }: { partyObj: { name?: string; phone?: string | null; balance?: number } | null }) {
  const [activeParty, setActiveParty] = useState(partyObj);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (partyObj && partyObj.balance != null && Number(partyObj.balance) !== 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- partyObj starts the badge entrance transition after the customer selection commits.
      setActiveParty(partyObj);
      setMounted(true);
      const timer = setTimeout(() => {
        setVisible(true);
      }, 20);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        setActiveParty(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- partyObj identity changes with parent renders; its displayed fields trigger the badge transition without restarting it.
  }, [partyObj?.name, partyObj?.phone, partyObj?.balance]);

  if (!mounted || !activeParty) return null;

  const bal = Number(activeParty.balance || 0);
  const isDue = bal > 0;
  const fmtN = (n: number) => Math.abs(n).toLocaleString(getStoreLocale(), { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() });

  return (
    <div
      className={clsx(
        "transition-all duration-300 ease-in-out shrink-0 overflow-hidden flex items-center",
        visible
          ? "opacity-100 scale-100 max-w-[200px] translate-x-0"
          : "opacity-0 scale-95 max-w-0 translate-x-2 pointer-events-none"
      )}
    >
      <div
        className={clsx(
          "h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border shadow-2xs whitespace-nowrap transition-colors",
          isDue
            ? "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200"
            : "bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200"
        )}
        title={isDue ? `Outstanding Old Due: ${getCurrencyPrefix()}${fmtN(bal)}` : `Advance Credit: ${getCurrencyPrefix()}${fmtN(bal)}`}
      >
        <span className="font-extrabold text-[11px] uppercase tracking-wider opacity-90">
          {isDue ? 'Due:' : 'Credit:'}
        </span>
        <span className={clsx(
          "px-2 py-0.5 rounded-md text-xs font-black text-white shadow-2xs",
          isDue ? "bg-rose-600 dark:bg-rose-600" : "bg-emerald-600 dark:bg-emerald-600"
        )}>
          {getCurrencyPrefix()}{fmtN(bal)}
        </span>
      </div>
    </div>
  );
}

