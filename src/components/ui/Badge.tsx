import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold transition-colors select-none tracking-tight',
            {
              'border-primary/25 bg-primary/10 text-primary': variant === 'default',
              'border-border/60 bg-secondary/80 text-secondary-foreground': variant === 'secondary',
              'border-destructive/25 bg-destructive/10 text-destructive': variant === 'destructive',
              'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': variant === 'success',
              'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400': variant === 'warning',
              'border-border/80 bg-background/50 text-muted-foreground': variant === 'outline',
            },
            className
          )
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
