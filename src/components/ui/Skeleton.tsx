import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Loading placeholder. A block `<span>` (looks like a div) so it is valid inside `<p>` and other phrasing content. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={twMerge(clsx("block animate-pulse rounded-md bg-muted", className))}
      {...props}
    />
  );
}
