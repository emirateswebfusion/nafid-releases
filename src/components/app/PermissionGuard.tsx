import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/permissions';

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  onBack?: () => void;
}

export function PermissionGuard({ permission, children, onBack }: PermissionGuardProps) {
  const { role, permissions } = useAuthStore();

  const isAllowed = hasPermission({ role, permissions }, permission);

  if (!isAllowed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md mb-6 text-sm">
          You don't have permission to access this section. Contact your administrator if you need access.
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
