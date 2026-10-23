import clsx from 'clsx';
import { Shield, User, SlidersHorizontal, Check, Lock, EyeOff, Eye } from 'lucide-react';
import { PermissionSelector } from '../../PermissionSelector';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffAccessTabProps {
  sm: StaffManagerState;
}

/** Staff form, access tab: system login, role and page permissions. */
export function StaffAccessTab({
  sm,
}: StaffAccessTabProps) {
  const { formData, setFormData } = sm;
  return (
    <div className="space-y-5 animate-in fade-in duration-200">

      <div>
        <h3 className="text-base font-extrabold text-foreground">System Access</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Optionally link a login account for POS or web dashboard access</p>
      </div>

      <div className={clsx(
        'rounded-2xl border transition-all overflow-hidden',
        formData.showSystemAccountSection ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-border/60 bg-muted/20'
      )}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'p-2 rounded-xl transition-colors',
              formData.showSystemAccountSection ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
            )}>
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-foreground">System Login Account</h4>
              <p className="text-[11px] text-muted-foreground">Allow sign-in via email & password</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.showSystemAccountSection}
              onChange={e => setFormData({ ...formData, showSystemAccountSection: e.target.checked, accessToggleTouched: true })}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {formData.showSystemAccountSection && (
          <div className="px-4 pb-4 pt-2 border-t border-indigo-500/15 space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-2">Access Level</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { role: 'STAFF', title: 'Staff', desc: 'Limited access — can view assigned data', icon: User },
                  { role: 'ADMIN', title: 'Admin', desc: 'Full access — inventory, reports & staff', icon: SlidersHorizontal },
                ].map(r => {
                  const Icon = r.icon;
                  const isSelected = formData.user_role === r.role;
                  return (
                    <div
                      key={r.role}
                      onClick={() => setFormData(current => ({
                        ...current,
                        user_role: r.role as any,
                        roleTouched: true,
                        permissions: r.role === 'ADMIN' ? ['*'] : current.permissions.filter(permission => permission !== '*'),
                        permissionsTouched: true,
                      }))}
                      className={clsx(
                        'p-3 rounded-xl border transition-all cursor-pointer',
                        isSelected
                          ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/20'
                          : 'bg-background border-border/50 hover:border-border hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <Icon className={clsx('w-3.5 h-3.5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="text-[11px] font-extrabold text-foreground">{r.title}</span>
                        </div>
                        {isSelected && <Check className="w-3 h-3 text-primary" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Password {formData.user_id && <span className="font-medium normal-case tracking-normal">(blank = keep current)</span>}
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={formData.showPassword ? 'text' : 'password'}
                  placeholder={formData.user_id ? 'Leave blank to keep current' : 'Minimum 8 characters'}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-9 pr-10 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground font-medium"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, showPassword: !formData.showPassword })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {formData.showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-2">
                Permissions
              </label>
              {formData.user_role === 'ADMIN' ? (
                <p className="text-xs text-muted-foreground rounded-xl border border-border/60 bg-card px-3 py-2.5">
                  Admin accounts automatically have full access. Permission selections apply to Staff accounts.
                </p>
              ) : (
                <PermissionSelector
                  selectedPermissions={formData.permissions}
                  onChange={(perms) => setFormData(current => ({ ...current, permissions: perms, permissionsTouched: true }))}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
