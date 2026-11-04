import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, XCircle } from 'lucide-react';
import { cardTerminalApi } from '../../data/cardTerminal';
import { bridgeEvents } from '../../data/events';
import { useCardTerminalStore, type CardTerminalPrompt } from '../../store/cardTerminalStore';
import { formatCurrency } from '../../utils/pricing/money';

const TONE: Record<CardTerminalPrompt['tone'], { icon: React.ReactNode; ring: string }> = {
  waiting: { icon: <Loader2 className="w-8 h-8 animate-spin" />, ring: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  success: { icon: <CheckCircle2 className="w-8 h-8" />, ring: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  error: { icon: <XCircle className="w-8 h-8" />, ring: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  warning: { icon: <AlertTriangle className="w-8 h-8" />, ring: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
};

const BUTTON: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  neutral: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
};

/** The card machine dialog: waiting for the terminal, its answer, and the cashier's choices. Mounted once in App. */
export const CardTerminalDialog: React.FC = () => {
  const prompt = useCardTerminalStore(s => s.prompt);
  const status = useCardTerminalStore(s => s.status);
  const [input, setInput] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => bridgeEvents.onCardTerminalStatus(s => useCardTerminalStore.getState().setStatus(s.message)), []);
  // Reset the per-prompt fields when a new prompt arrives (state adjusted during render, not in an effect).
  const [shownPrompt, setShownPrompt] = useState(prompt);
  if (shownPrompt !== prompt) { setShownPrompt(prompt); setInput(''); setCancelling(false); }

  if (!prompt) return null;
  const tone = TONE[prompt.tone];
  const cancel = async () => {
    setCancelling(true);
    try { await cardTerminalApi.cancel(); } catch { /* the sale request reports the outcome */ }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 select-none" role="dialog" aria-modal="true" aria-label={prompt.title}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 text-center space-y-4">
        <div className={`mx-auto w-16 h-16 rounded-2xl border flex items-center justify-center ${tone.ring}`}>{tone.icon}</div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{prompt.title}</h3>
          <div className="inline-flex items-center gap-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
            <CreditCard className="w-5 h-5 text-slate-400" />{formatCurrency(prompt.amount)}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{prompt.message}</p>
          {prompt.tone === 'waiting' && status && <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{status}</p>}
        </div>
        {prompt.input && (
          <label className="block text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
            {prompt.input.label}
            <input
              value={input}
              onChange={e => setInput(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 12))}
              placeholder={prompt.input.placeholder}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
              autoFocus
            />
          </label>
        )}
        <div className="space-y-2 pt-1">
          {prompt.actions.map(action => (
            <button
              key={action.id}
              disabled={action.requiresInput && !input.trim()}
              onClick={() => useCardTerminalStore.getState().answer({ action: action.id, input })}
              className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${BUTTON[action.tone || 'neutral']}`}
            >
              {action.label}
            </button>
          ))}
          {prompt.cancellable && (
            <button onClick={cancel} disabled={cancelling} className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm disabled:opacity-40 ${BUTTON.neutral}`}>
              {cancelling ? 'Cancelling…' : 'Cancel on terminal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
