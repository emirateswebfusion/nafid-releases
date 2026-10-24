import { Skeleton } from '../../ui/Skeleton';

/** Loading skeleton for the settings grades screen. */
export function GradesLoadingState() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="px-6 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </header>

      <div className="flex-1 p-6 space-y-6 overflow-hidden">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-72 rounded-xl" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>

        <div className="grid grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((cat) => (
            <div key={cat} className="p-4 rounded-2xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
