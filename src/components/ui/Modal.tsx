import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fullScreen?: boolean;
  closeButton?: React.ReactNode;
  overlayClassName?: string;
}

export function Modal({ isOpen, onClose, title, children, className, fullScreen = false, closeButton, overlayClassName }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className={twMerge('fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[6px] p-4 select-none animate-in fade-in duration-200', overlayClassName)}>
      <div 
        className={twMerge(
          clsx(
            'bg-card border border-border/70 shadow-2xl flex flex-col backdrop-blur-md animate-in zoom-in-95 duration-200',
            fullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-2xl max-h-[90vh] rounded-[28px]',
            className
          )
        )}
      >
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-border/40 bg-muted/20 dark:bg-muted/5">
          <div className="text-sm font-black uppercase tracking-widest text-foreground">{title}</div>
          {closeButton !== undefined ? closeButton : (
            <button onClick={onClose} className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center shadow-sm" title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
        <div className={clsx("flex-1 overflow-y-auto", !fullScreen && "p-6")}>
          {children}
        </div>
      </div>
    </div>
  );
}
