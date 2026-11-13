import { useState, useEffect, useCallback, useRef } from 'react';
import { Store, Delete, RotateCcw, Loader2, CloudOff, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';

interface QuickPinLoginProps {
  shopName: string;
  userName?: string;
  userId?: string;
  role?: string;
  cloudSyncReady?: boolean;
  initialLockoutSeconds?: number;
  onSwitchToEmail: () => void;
}

export function QuickPinLogin({ shopName, userName, userId, role, cloudSyncReady, initialLockoutSeconds = 0, onSwitchToEmail }: QuickPinLoginProps) {
  const loginWithPin = useAuthStore(state => state.loginWithPin);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    initialLockoutSeconds > 0 ? `Too many failed attempts. Locked for ${initialLockoutSeconds}s.` : ''
  );
  const [shake, setShake] = useState(false);
  const failedAttemptsRef = useRef(0);
  const [lockoutTimer, setLockoutTimer] = useState(initialLockoutSeconds);

  useEffect(() => {
    if (lockoutTimer <= 0) return;
    const timer = setInterval(() => {
      setLockoutTimer(t => {
        if (t <= 1) {
          failedAttemptsRef.current = 0;
          setError('');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutTimer]);
  const isSubmittingRef = useRef(false);

  const handleSubmitPin = useCallback(async (pinToSubmit: string) => {
    if (pinToSubmit.length !== 4 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    const res = await loginWithPin(pinToSubmit, userId);
    if (!res.success) {
      if (typeof res.remaining_seconds === 'number' && res.remaining_seconds > 0) {
        failedAttemptsRef.current = 5;
        setLockoutTimer(res.remaining_seconds);
        setError(res.error || `Too many failed attempts. Locked for ${res.remaining_seconds}s.`);
      } else if (typeof res.attempts_remaining === 'number') {
        failedAttemptsRef.current = Math.max(0, 5 - res.attempts_remaining);
        const baseError = res.error || 'Invalid PIN';
        setError(`${baseError} (${res.attempts_remaining} attempts remaining)`);
      } else {
        failedAttemptsRef.current += 1;
        const count = failedAttemptsRef.current;
        if (count >= 5) {
          setLockoutTimer(30);
          setError('Too many failed attempts. Locked for 30s.');
        } else {
          setError(res.error || `Invalid PIN (${5 - count} attempts remaining)`);
        }
      }
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
    } else {
      failedAttemptsRef.current = 0;
    }
    setLoading(false);
    isSubmittingRef.current = false;
  }, [loginWithPin, userId]);

  const handleDigit = useCallback((d: string) => {
    if (loading || isSubmittingRef.current || lockoutTimer > 0) return;
    setError('');
    setPin(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        setTimeout(() => handleSubmitPin(next), 50);
      }
      return next;
    });
  }, [loading, handleSubmitPin, lockoutTimer]);

  const handleBackspace = useCallback(() => {
    if (loading || isSubmittingRef.current || lockoutTimer > 0) return;
    setError('');
    setPin(prev => prev.slice(0, -1));
  }, [loading, lockoutTimer]);

  const handleClear = useCallback(() => {
    if (loading || isSubmittingRef.current || lockoutTimer > 0) return;
    setError('');
    setPin('');
  }, [loading, lockoutTimer]);

  // Physical keyboard and barcode scanner handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        handleSubmitPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear, handleSubmitPin, pin]);

  return (
    <div className="space-y-6 w-full max-w-sm mx-auto animate-in fade-in zoom-in-95 duration-200">
      {/* Shop & Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide">
          <Store className="w-3.5 h-3.5" />
          <span>{shopName || 'POS Counter Terminal'}</span>
        </div>
        {userName && <p className="text-sm text-foreground">👤 {userName}{role ? ` - ${role === 'ADMIN' ? 'Admin' : role === 'STAFF' ? 'Staff' : role}` : ''}</p>}
        <h2 className="text-2xl font-black text-foreground tracking-tight">Terminal Locked</h2>
        <p className="text-xs text-muted-foreground">
          Enter your 4-digit PIN to unlock
        </p>
        {cloudSyncReady === false && (
          <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-semibold">
            <CloudOff className="w-3 h-3 shrink-0" />
            <span>Offline PIN only — sign in with Email to reconnect cloud sync</span>
          </p>
        )}
      </div>

      {/* PIN Dots Display */}
      <div className="flex flex-col items-center justify-center space-y-3 py-2">
        <div
          className={clsx(
            'flex items-center justify-center gap-4 transition-transform',
            shake && 'animate-shake'
          )}
        >
          {[0, 1, 2, 3].map(idx => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={clsx(
                  'w-4 h-4 rounded-full border-2 transition-all duration-200 flex items-center justify-center',
                  isFilled
                    ? 'border-primary bg-primary scale-110 shadow-sm shadow-primary/30'
                    : 'border-muted-foreground/30 bg-muted/40'
                )}
              />
            );
          })}
        </div>

        {/* Error message */}
        <div className="h-5 flex items-center justify-center">
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Verifying credentials...</span>
            </div>
          ) : error ? (
            <p className="text-xs font-bold text-destructive animate-in fade-in duration-150">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {/* Numeric Keypad (3x4 Grid) */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto select-none">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigit(num)}
            disabled={loading}
            className="h-14 rounded-2xl bg-card border border-border/80 hover:bg-primary/10 hover:border-primary/40 active:scale-95 text-foreground text-xl font-black transition-all duration-150 shadow-xs flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            {num}
          </button>
        ))}

        {/* Clear Button */}
        <button
          type="button"
          onClick={handleClear}
          disabled={loading || pin.length === 0}
          className="h-14 rounded-2xl bg-card border border-border/80 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive active:scale-95 text-muted-foreground text-xs font-black transition-all duration-150 shadow-xs flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-30"
          title="Clear PIN"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="text-[10px]">C</span>
        </button>

        {/* Zero */}
        <button
          type="button"
          onClick={() => handleDigit('0')}
          disabled={loading}
          className="h-14 rounded-2xl bg-card border border-border/80 hover:bg-primary/10 hover:border-primary/40 active:scale-95 text-foreground text-xl font-black transition-all duration-150 shadow-xs flex items-center justify-center cursor-pointer disabled:opacity-50"
        >
          0
        </button>

        {/* Backspace Button */}
        <button
          type="button"
          onClick={handleBackspace}
          disabled={loading || pin.length === 0}
          className="h-14 rounded-2xl bg-card border border-border/80 hover:bg-primary/10 hover:border-primary/40 active:scale-95 text-muted-foreground hover:text-foreground text-xs font-black transition-all duration-150 shadow-xs flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-30"
          title="Backspace"
        >
          <Delete className="w-4 h-4" />
          <span className="text-[10px]">⌫</span>
        </button>
      </div>

      {/* Log out / Switch Account */}
      <div className="pt-2 text-center border-t border-border/60">
        <button
          type="button"
          onClick={() => {
            onSwitchToEmail();
            void useAuthStore.getState().logout();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors py-1.5 px-3 rounded-lg hover:bg-destructive/10 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log out to switch account</span>
        </button>
      </div>
    </div>
  );
}
