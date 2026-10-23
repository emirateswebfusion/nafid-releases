import { Ban } from 'lucide-react';

export interface AccessRestrictedViewProps {
  onClose: () => void;
}

/** Permission guard shown when the profile may not view the recycle bin. */
export function AccessRestrictedView({ onClose }: AccessRestrictedViewProps) {
  return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6 text-foreground">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto text-rose-500">
            <Ban size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Access Restricted</h3>
            <p className="text-xs text-muted-foreground mt-1">
              You need view permissions to inspect the Recycle Bin. Please log in with an authorized profile.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
  );
}
