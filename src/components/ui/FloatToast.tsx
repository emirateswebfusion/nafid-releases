import * as React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import clsx from 'clsx';
import { RedCrossButton } from './RedCrossButton';

export interface ToastMessage {
  text: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
}

interface FloatToastProps {
  message: ToastMessage | null | string;
  onClose: () => void;
  title?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  position?: 'bottom-right' | 'bottom-left';
  duration?: number;
}

export function FloatToast({ message, onClose, title, type = 'success', position = 'bottom-right', duration = 4000 }: FloatToastProps) {
  React.useEffect(() => {
    if (!message || duration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const msgText = typeof message === 'string' ? message : message.text;
  const msgType = typeof message === 'string' ? type : message.type;
  const defaultTitle = msgType === 'success' ? 'STATUS' : msgType === 'error' ? 'ALERT' : 'NOTIFICATION';
  const msgTitle = typeof message === 'string' ? (title || defaultTitle) : (message.title || defaultTitle);

  const iconMap = {
    success: <CheckCircle2 className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
    warning: <AlertCircle className="w-4 h-4" />,
  };

  const badgeColorMap = {
    success: 'bg-emerald-500/25 text-emerald-400',
    error: 'bg-red-500/25 text-red-400',
    info: 'bg-blue-500/25 text-blue-400',
    warning: 'bg-amber-500/25 text-amber-400',
  };

  const posClass = position === 'bottom-left' ? 'bottom-5 left-5' : 'bottom-5 right-5';

  return (
    <div className={clsx('fixed z-[999999] px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto max-w-md', posClass)}>
      <div className={clsx('p-2 rounded-xl shrink-0', badgeColorMap[msgType] || badgeColorMap.info)}>
        {iconMap[msgType] || iconMap.info}
      </div>
      <div className="flex-1 min-w-0 leading-snug">
        <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">{msgTitle}</span>
        <span className="text-white font-bold text-xs block leading-tight">{msgText}</span>
      </div>
      <RedCrossButton onClick={onClose} size="sm" />
    </div>
  );
}
