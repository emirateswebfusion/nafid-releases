import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

/** Covers every restart-to-update entry point while the verified installer is being started. */
export function UpdateInstallProgress({ version }: { version?: string }) {
  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl bg-card border border-border p-8 text-center shadow-2xl">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <h2 className="mt-5 text-xl font-bold">Preparing update{version ? ` v${version}` : ''}</h2>
        <p className="mt-3 text-sm text-muted-foreground">Starting the installer. Installation progress will appear in a separate window.</p>
        <p className="mt-2 text-sm text-muted-foreground">Nafid will reopen automatically when installation finishes.</p>
      </div>
    </div>,
    document.body,
  );
}
