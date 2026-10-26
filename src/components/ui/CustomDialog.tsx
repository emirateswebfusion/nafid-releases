import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Trash2, X, Loader2, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export type DialogVariant = 'danger' | 'warning' | 'info' | 'success';

export interface CustomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  icon?: LucideIcon;
  isLoading?: boolean;
  hideCancel?: boolean;
  children?: React.ReactNode;
}

export function CustomDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  icon: CustomIcon,
  isLoading = false,
  hideCancel = false,
  children
}: CustomDialogProps) {
  if (!isOpen) return null;

  const defaultIcons: Record<DialogVariant, LucideIcon> = {
    danger: Trash2,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle2
  };

  const IconComponent = CustomIcon || defaultIcons[variant];

  const variantStyles: Record<DialogVariant, {
    iconBg: string;
    iconText: string;
    iconBorder: string;
    confirmBtn: string;
  }> = {
    danger: {
      iconBg: 'bg-rose-500/10 dark:bg-rose-500/20',
      iconText: 'text-rose-600 dark:text-rose-400',
      iconBorder: 'border-rose-500/20',
      confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
    },
    warning: {
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
      iconText: 'text-amber-600 dark:text-amber-400',
      iconBorder: 'border-amber-500/20',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
    },
    info: {
      iconBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconText: 'text-blue-600 dark:text-blue-400',
      iconBorder: 'border-blue-500/20',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
    },
    success: {
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      iconText: 'text-emerald-600 dark:text-emerald-400',
      iconBorder: 'border-emerald-500/20',
      confirmBtn: 'bg-[#00a870] hover:bg-[#009663] text-white shadow-emerald-600/20'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Close X Button */}
        {!isLoading && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div
            className={clsx(
              'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border',
              styles.iconBg,
              styles.iconText,
              styles.iconBorder
            )}
          >
            <IconComponent className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-snug">
              {title}
            </h3>
            {description && (
              <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mt-1">
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Optional Custom Content / Input Body */}
        {children && <div className="pt-1">{children}</div>}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-zinc-800/80">
          {!hideCancel && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}

          {onConfirm && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onConfirm}
              className={clsx(
                'flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50',
                styles.confirmBtn
              )}
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{confirmText}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

