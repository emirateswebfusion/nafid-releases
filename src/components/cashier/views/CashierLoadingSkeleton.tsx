import { Skeleton } from '../../ui/Skeleton';

/** Loading skeleton of the cashier settlement screen (header, summary cards, lists). */
export function CashierLoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Top Header Skeleton */}
      <header className="px-5 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-44 rounded-2xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </header>

      {/* Dashboard Skeleton Body */}
      <div className="flex-1 p-5 space-y-5 overflow-hidden flex flex-col">
        {/* Summary Cards Grid Skeleton */}
        <div className="grid grid-cols-4 gap-4 shrink-0">
          {[1, 2, 3, 4].map((c) => (
            <div key={c} className="p-4 rounded-2xl border border-border bg-card space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>

        {/* Main Content Area Skeleton */}
        <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
          {/* Left Queue Pane Skeleton (8 cols) */}
          <div className="col-span-8 border border-border rounded-2xl bg-card p-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-72 rounded-xl" />
              <Skeleton className="h-9 w-28 rounded-xl" />
            </div>
            <div className="flex-1 space-y-3 overflow-hidden">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex items-center justify-between p-3 rounded-xl border border-border/50">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-5 h-5 rounded-md" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
              ))}
            </div>
          </div>

          {/* Right Pane Skeleton (4 cols) */}
          <div className="col-span-4 border border-border rounded-2xl bg-card p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((tx) => (
                <div key={tx} className="p-3 rounded-xl border border-border/40 flex justify-between items-center">
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
