import * as React from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface RedCrossButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function RedCrossButton({ onClick, className, size = 'md', title = 'Close', type = 'button', ...props }: RedCrossButtonProps) {
  const sizeClasses = {
    sm: 'p-1.5 rounded-lg',
    md: 'p-2 rounded-xl',
    lg: 'p-2.5 rounded-2xl',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <button
      type={type}
      onClick={onClick}
      className={clsx(
        'text-destructive bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center shadow-xs',
        sizeClasses,
        className
      )}
      title={title}
      {...props}
    >
      <X className={clsx(iconSizes, 'text-destructive')} />
    </button>
  );
}
