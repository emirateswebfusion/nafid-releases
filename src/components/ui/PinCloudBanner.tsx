import { Mail, Lock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export interface PinCloudBannerProps {
  /** Short description of the cloud-only capability on this screen (e.g. "UAE e-invoice cloud settings"). */
  feature: string;
  className?: string;
}

/**
 * In-page notice shown to PIN-switched operators (`isAuthenticated && !token`) so they know why
 * direct cloud-REST features require signing in with Email & Password, with a one-click jump.
 */
export function PinCloudBanner({ feature, className = '' }: PinCloudBannerProps) {
  const isPinSession = useAuthStore((s) => s.isAuthenticated && !s.token);
  if (!isPinSession) return null;

  return (
    <div
      role="status"
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 ${className}`.trim()}
    >
      <div className="flex items-start sm:items-center gap-2.5 text-xs">
        <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" />
        <p className="leading-relaxed">
          <strong className="font-bold">PIN session active:</strong> POS billing and background sync work normally,
          but {feature} requires an Email &amp; Password sign-in.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void useAuthStore.getState().switchToEmailLogin()}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer"
      >
        <Mail className="w-3.5 h-3.5" />
        <span>Sign in with Email</span>
      </button>
    </div>
  );
}
