import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-xs font-semibold ring-offset-background transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none tracking-tight',
            {
              'bg-gradient-to-b from-primary to-primary/90 text-primary-foreground hover:brightness-105 shadow-[0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.2)]': variant === 'default',
              'bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground hover:brightness-105 shadow-[0_1px_3px_rgba(239,68,68,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]': variant === 'destructive',
              'border border-border/80 bg-card/70 hover:bg-secondary hover:text-foreground text-foreground shadow-xs backdrop-blur-xs': variant === 'outline',
              'bg-secondary/90 text-secondary-foreground hover:bg-secondary border border-border/40 shadow-xs': variant === 'secondary',
              'hover:bg-muted text-muted-foreground hover:text-foreground active:scale-100': variant === 'ghost',
              'text-primary underline-offset-4 hover:underline active:scale-100 font-medium': variant === 'link',
              'h-9.5 px-4 py-2': size === 'default',
              'h-8.5 px-3 py-1.5 text-[11px]': size === 'sm',
              'h-11 px-6 py-2.5 text-sm': size === 'lg',
              'h-9.5 w-9.5 p-0': size === 'icon',
            },
            className
          )
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
