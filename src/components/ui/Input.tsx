import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, ...props }, ref) => {
    return (
      <input
        type={type}
        onWheel={(e) => {
          if (type === 'number') {
            (e.target as HTMLInputElement).blur();
          }
          onWheel?.(e);
        }}
        className={twMerge(
          clsx(
            'flex h-10 w-full rounded-xl border border-input bg-background/50 px-3.5 py-2 text-xs font-semibold text-foreground placeholder:text-muted-foreground/45 transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background disabled:cursor-not-allowed disabled:opacity-50',
            type === 'number' && 'no-spinners',
            className
          )
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
