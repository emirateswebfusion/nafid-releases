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
}

export function Modal({ isOpen, onClose, title, children, className, fullScreen = false, closeButton }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        className={twMerge(
          clsx(
            'bg-background border border-border shadow-lg flex flex-col',
            fullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-2xl max-h-[90vh] rounded-xl',
            className
          )
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="text-lg font-semibold">{title}</div>
          {closeButton !== undefined ? closeButton : (
            <button onClick={onClose} className="p-2 -mr-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors">
              <X className="w-5 h-5" />
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
