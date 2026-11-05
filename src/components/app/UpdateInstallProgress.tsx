import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

/** Covers every restart-to-update entry point while the verified installer is being started. */
export function UpdateInstallProgress({ version, phase = 'preparing', percent }: { version?: string; phase?: 'preparing' | 'verifying-installer' | 'starting-installer'; percent?: number | null }) {
  return createPortal(
    <div role="status" aria-live="polite" className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl bg-card border border-border p-8 text-center shadow-2xl">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <h2 className="mt-5 text-xl font-bold">Preparing update{version ? ` v${version}` : ''}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{phase === 'verifying-installer' ? 'Checking the downloaded update…' : phase === 'starting-installer' ? 'Windows is starting the installer…' : 'Preparing to install the update…'} Installation progress will appear in a separate window.</p>
        {phase === 'verifying-installer' && typeof percent === 'number' && Number.isFinite(percent) && (
          <div className="mt-4">
            <div role="progressbar" aria-label="Update file verification" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-sm font-semibold">Verification {percent}%</p>
          </div>
        )}
        {phase === 'starting-installer' && <p className="mt-3 text-sm text-muted-foreground">Windows may take a little longer to check and open the installer. Keep Nafid open.</p>}
        <p className="mt-2 text-sm text-muted-foreground">Nafid will reopen automatically when installation finishes.</p>
      </div>
    </div>,
    document.body,
  );
}
