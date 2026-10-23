import React from 'react';
import { KeyRound, XCircle, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { SuperDashboardState } from '../hooks/useSuperDashboardState';

export interface VerificationCodeModalProps {
  handleRequestVerificationCode: () => Promise<void>;
  handleVerifyCode: (e?: React.FormEvent) => Promise<void>;
  sd: SuperDashboardState;
}

/** Verification code dialog that unlocks a tenant's masked credentials. */
export function VerificationCodeModal({
  handleRequestVerificationCode, handleVerifyCode, sd,
}: VerificationCodeModalProps) {
  const { setVerificationCode, setVerificationError, setVerificationModalOpen, setVerificationStatus, setVerificationTenantId, verificationCode, verificationError, verificationStatus } = sd;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-md rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Modal Title */}
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" />
            Security Verification
          </h2>
          <button
            onClick={() => {
              setVerificationModalOpen(false);
              setVerificationTenantId(null);
              setVerificationCode('');
              setVerificationStatus('idle');
              setVerificationError('');
            }}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {verificationStatus === 'idle' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                To view this store's database connection details, we need to verify your identity.
                A 6-digit verification code will be sent to your registered admin email address.
              </p>
              <button
                onClick={handleRequestVerificationCode}
                className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                Send Verification Code
              </button>
            </div>
          )}

          {verificationStatus === 'sending' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">Sending verification code...</span>
            </div>
          )}

          {(verificationStatus === 'waiting' || verificationStatus === 'verifying' || verificationStatus === 'failed') && (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter the 6-digit verification code sent to your email.
              </p>
              <div>
                <input
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground/30 font-mono text-2xl tracking-[0.75em] pl-[0.75em] focus:outline-none focus:ring-1.5 focus:ring-amber-500/50 transition duration-200"
                  placeholder="000000"
                />
              </div>

              {verificationError && (
                <div className="text-[11px] text-rose-500 font-medium bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {verificationError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRequestVerificationCode}
                  disabled={verificationStatus === 'verifying'}
                  className="flex-1 py-2 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition cursor-pointer disabled:opacity-50"
                >
                  Resend Code
                </button>
                <button
                  type="submit"
                  disabled={verificationStatus === 'verifying' || verificationCode.length !== 6}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg transition cursor-pointer text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {verificationStatus === 'verifying' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Verify & Reveal'
                  )}
                </button>
              </div>
            </form>
          )}

          {verificationStatus === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
              <span className="text-xs text-emerald-500 font-bold">Identity Verified!</span>
              <span className="text-[10px] text-muted-foreground">Revealing credentials...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
