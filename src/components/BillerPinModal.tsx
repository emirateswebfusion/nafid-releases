import React, { useState, useEffect, useRef } from 'react';
import { Lock, AlertCircle, Loader2, CheckCircle2, KeyRound, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import clsx from 'clsx';

interface BillerPinModalProps {
  isOpen: boolean;
  tenantId: string;
  onClose: () => void;
  onVerified: (staff: { staff_id: string; staff_code: string; name: string; role_designation?: string }) => void;
}

export function BillerPinModal({ isOpen, tenantId, onClose, onVerified }: BillerPinModalProps) {
  useCloseOnEscape(onClose);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (isOpen) {
      setPinDigits(['', '', '', '']);
      setError('');
      setLoading(false);
      setSuccess(false);
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const verifyPin = async (fullPin: string) => {
    if (fullPin.length !== 4) return;
    setLoading(true);
    setError('');

    try {
      if (window.electronAPI?.dbVerifyBillerPin) {
        const res = await window.electronAPI.dbVerifyBillerPin({ tenant_id: tenantId, pin: fullPin });
        if (res.success && res.staff) {
          setSuccess(true);
          setTimeout(() => {
            onVerified(res.staff);
          }, 300);
        } else {
          setError(res.error || 'Invalid Biller PIN');
          setPinDigits(['', '', '', '']);
          setTimeout(() => inputRefs[0].current?.focus(), 100);
        }
      } else {
        // Fallback or web API call if electronAPI not present
        setError('Biller PIN verification is only supported on POS desktop app');
      }
    } catch (err: any) {
      setError(err.message || 'Verification error');
      setPinDigits(['', '', '', '']);
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    // Keep only last typed digit and numbers only
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...pinDigits];
    next[index] = digit;
    setPinDigits(next);
    setError('');

    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus();
    }

    const full = next.join('');
    if (full.length === 4 && !next.includes('')) {
      verifyPin(full);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === 'Enter') {
      const full = pinDigits.join('');
      if (full.length === 4) {
        verifyPin(full);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setPinDigits(next);
    if (pasted.length === 4) {
      verifyPin(pasted);
    } else {
      inputRefs[Math.min(pasted.length, 3)].current?.focus();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="sm">
      <div className="p-6 text-center">
        {/* Header Icon */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-sm">
          {loading ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : success ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-500 animate-bounce" />
          ) : (
            <KeyRound className="w-7 h-7" />
          )}
        </div>

        <h3 className="text-lg font-bold text-foreground mb-1">Enter Biller PIN</h3>
        <p className="text-xs text-muted-foreground mb-6">
          Enter your 4-digit code to authorize & print this invoice
        </p>

        {/* 4 PIN Boxes */}
        <div className="flex items-center justify-center gap-3 mb-6" onPaste={handlePaste}>
          {pinDigits.map((digit, idx) => (
            <input
              key={idx}
              ref={inputRefs[idx]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={loading || success}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className={clsx(
                'w-13 h-14 text-center text-2xl font-black rounded-2xl border-2 transition-all duration-150 outline-none',
                error
                  ? 'border-rose-500 bg-rose-500/10 text-rose-600 animate-shake'
                  : success
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                  : digit
                  ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                  : 'border-border bg-background focus:border-primary focus:ring-4 focus:ring-primary/10'
              )}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-500/10 p-2.5 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action button */}
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Cancel Print
          </button>
        </div>
      </div>
    </Modal>
  );
}
