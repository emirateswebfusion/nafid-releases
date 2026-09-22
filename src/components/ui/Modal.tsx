import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RedCrossButton } from './RedCrossButton';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  size?: string;
  fullScreen?: boolean;
  closeButton?: React.ReactNode;
  overlayClassName?: string;
}

export function Modal({ isOpen, onClose, title, children, className, contentClassName, fullScreen = false, closeButton, overlayClassName }: ModalProps) {
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
        {/* Only render header row when title is not explicitly null */}
        {title !== null && (
          <div className="flex items-center justify-between px-6 py-4.5 border-b border-border/40 bg-muted/20 dark:bg-muted/5">
            <div className="text-sm font-black uppercase tracking-widest text-foreground">{title}</div>
            {closeButton !== undefined ? closeButton : (
              <RedCrossButton onClick={onClose} />
            )}
          </div>
        )}
        <div className={twMerge(clsx('flex-1 overflow-y-auto', !fullScreen && title !== null && 'p-6'), contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
