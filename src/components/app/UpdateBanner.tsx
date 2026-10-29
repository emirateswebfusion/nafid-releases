import { useState, useEffect } from 'react';
import { X, RotateCcw, Zap } from 'lucide-react';
import clsx from 'clsx';
import { getReleaseNotesSummary } from '../settings/releaseNotesUtils';
import { useUpdateStore } from '../../store/updateStore';

interface UpdateBannerProps {
  onOpenSettings: () => void;
}

export default function UpdateBanner({ onOpenSettings }: UpdateBannerProps) {
  const { updateInfo, updateReady, installUpdate, init } = useUpdateStore();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('vendora-update-banner-dismissed');
    if (stored) {
      const hoursSince = (Date.now() - Number(stored)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- vendora-update-banner-dismissed hides the banner immediately when its saved suppression window is active.
        setDismissed(true);
        return;
      }
      localStorage.removeItem('vendora-update-banner-dismissed');
    }

    init();
  }, [init]);

  if (!updateInfo && !updateReady) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('vendora-update-banner-dismissed', String(Date.now()));
  };

  const handleInstall = () => {
    installUpdate();
  };

  return (
    <div className="relative z-40 mx-2 mt-2 mb-0 animate-in slide-in-from-top-2 fade-in duration-300">
      <div className={clsx(
        'flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border shadow-sm backdrop-blur-md',
        updateReady
          ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground'
          : 'bg-blue-500/10 border-blue-500/30 text-foreground'
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            'p-2 rounded-xl shrink-0',
            updateReady ? 'bg-emerald-500/20 text-emerald-600' : 'bg-blue-500/20 text-blue-600'
          )}>
            {updateReady ? <RotateCcw className="w-4 h-4 animate-spin-reverse" /> : <Zap className="w-4 h-4 fill-blue-500/20" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx(
                'text-xs font-black uppercase tracking-wider',
                updateReady ? 'text-emerald-600' : 'text-blue-600'
              )}>
                {updateReady ? 'Update Ready' : 'New Update Available'}
              </span>
              {updateInfo && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono bg-background/60 border border-border/50">
                  v{updateInfo.version}
                </span>
              )}
            </div>
            {updateInfo?.releaseNotes && !updateReady && (
              <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                {getReleaseNotesSummary(updateInfo.releaseNotes)}
              </p>
            )}
            {updateReady && (
              <p className="text-[10px] text-emerald-600/70 mt-0.5">
                Restart to update
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {updateReady ? (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Update →
            </button>
          ) : (
            <button
              onClick={() => { handleDismiss(); onOpenSettings(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 border border-blue-500/30 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-3 h-3 fill-blue-500/20" />
              See What's New
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-background/50 transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
