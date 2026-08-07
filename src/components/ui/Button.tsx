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
            'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold ring-offset-background transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
            {
              'bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm hover:shadow-md': variant === 'default',
              'bg-destructive text-destructive-foreground hover:bg-destructive/95 shadow-sm hover:shadow-md': variant === 'destructive',
              'border border-input bg-background hover:bg-secondary hover:text-secondary-foreground shadow-sm': variant === 'outline',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
              'hover:bg-secondary hover:text-secondary-foreground active:scale-100': variant === 'ghost',
              'text-primary underline-offset-4 hover:underline active:scale-100': variant === 'link',
              'h-10 px-5 py-2.5': size === 'default',
              'h-9.5 px-4 py-2': size === 'sm',
              'h-11 px-8 py-3': size === 'lg',
              'h-10 w-10 p-0': size === 'icon',
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
