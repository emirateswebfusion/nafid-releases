import React from 'react';
import { ShieldAlert, LogIn, CloudOff, X } from 'lucide-react';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose?: () => void;
}

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ isOpen, onConfirm, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Continue Offline"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Icon & Badge */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
          <ShieldAlert className="w-8 h-8" />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
            !
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Cloud Sync Unavailable
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Your authorization token has expired. Local POS operations (billing, inventory, sales history, ledger) remain fully active and will continue working uninterrupted.
          </p>
        </div>

        {/* Status Pill - Exact required text */}
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold border border-amber-500/30">
          <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Cloud Sync unavailable. Please login to resume cloud synchronization.</span>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Login to Resume Cloud Sync</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors cursor-pointer"
            >
              Continue Working Offline
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
