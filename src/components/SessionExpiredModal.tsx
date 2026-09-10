import React from 'react';
import { ShieldAlert, LogIn, CloudOff } from 'lucide-react';

interface SessionExpiredModalProps {
  isOpen: boolean;
  onConfirm: () => void;
}

export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ isOpen, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
        {/* Icon & Badge */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
          <ShieldAlert className="w-8 h-8" />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
            !
          </span>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Cloud Session Expired
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Your authorization token has expired or is invalid. Cloud synchronization has been safely paused.
          </p>
        </div>

        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700">
          <CloudOff className="w-3.5 h-3.5 text-amber-500" />
          <span>Cloud Sync Paused • Re-login Required</span>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Re-Login Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
