import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/security/permissions';

import { useFeatureFlagsStore, isFeatureEnabled, type FeatureKey } from '../../config/featureFlags';

interface PermissionGuardProps {
  permission?: string;
  feature?: FeatureKey;
  children: React.ReactNode;
  onBack?: () => void;
}

export function PermissionGuard({ permission, feature, children, onBack }: PermissionGuardProps) {
  const { role, permissions } = useAuthStore();

  const flags = useFeatureFlagsStore(s => s.flags);
  const featureAllowed = !feature || isFeatureEnabled(flags, feature);
  const isAllowed = featureAllowed && (!permission || hasPermission({ role, permissions }, permission));

  if (!isAllowed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{featureAllowed ? 'Access Restricted' : 'This module is turned off'}</h2>
        <p className="text-muted-foreground max-w-md mb-6 text-sm">
          {featureAllowed ? "You don't have permission to access this section. Contact your administrator if you need access." : 'Your shop has disabled this module. You can change shop modules in Settings.'}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
