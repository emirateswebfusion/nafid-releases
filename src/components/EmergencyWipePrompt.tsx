import clsx from 'clsx';
import type { useEmergencyPanicTrigger } from '../hooks/useEmergencyPanicTrigger';

/**
 * Administrator confirmation for an emergency wipe of this terminal (opened by the configured hotkey or gesture).
 * The main process re-checks the credentials and records the wipe in the audit log before any data is removed.
 */
export function EmergencyWipePrompt({ panic }: { panic: ReturnType<typeof useEmergencyPanicTrigger> }) {
  const { showPinPrompt, setShowPinPrompt, enteredEmail, setEnteredEmail, enteredPin, setEnteredPin, pinError, pinErrorText, handlePinSubmit, isPurging } = panic;
  return (
    <>
      {/* Emergency wipe: administrator re-authentication (checked again in the main process, then audited) */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <form onSubmit={handlePinSubmit} role="dialog" aria-modal="true" className="bg-card p-6 rounded-2xl border border-border shadow-2xl max-w-xs w-full space-y-3">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-foreground">Administrator confirmation</h3>
              <p className="text-xs text-muted-foreground">Wiping this terminal requires an administrator. The action is recorded in the audit log.</p>
            </div>
            <input
              type="email"
              autoFocus
              value={enteredEmail}
              onChange={(e) => setEnteredEmail(e.target.value)}
              placeholder="Administrator email"
              className="w-full h-10 px-3 text-xs rounded-xl border border-border bg-background outline-hidden focus:border-primary"
            />
            <input
              type="password"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              placeholder="Password"
              className={clsx(
                "w-full h-10 px-3 text-xs rounded-xl border bg-background outline-hidden transition-all",
                pinError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-border focus:border-primary"
              )}
            />
            {pinError && <p className="text-[11px] text-rose-500 text-center font-medium">{pinErrorText || 'Administrator password required'}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPinPrompt(false)}
                className="flex-1 h-9 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!enteredEmail || !enteredPin || isPurging}
                className="flex-1 h-9 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
              >
                Wipe terminal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Emergency Purging Overlay */}
      {isPurging && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            <p className="text-xs font-mono text-muted-foreground">Resetting local system...</p>
          </div>
        </div>
      )}
    </>
  );
}
