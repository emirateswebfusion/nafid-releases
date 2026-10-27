import React from 'react';
import { Shield, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import type { SettingsForm } from '../settingsFormTypes';

export interface AccountSecurityTabProps {
  changingPass: boolean; setPass: SettingsForm['setPass']; pass: SettingsForm['pass'];
  showOldPass: boolean; setShowOldPass: SettingsForm['setShowOldPass'];
  showNewPass: boolean; setShowNewPass: SettingsForm['setShowNewPass'];
  showConfirmPass: boolean; setShowConfirmPass: SettingsForm['setShowConfirmPass'];
  handleChangePassword: (e: React.FormEvent) => void;
}

/** Change Password for the signed-in account. */
export const AccountSecurityTab: React.FC<AccountSecurityTabProps> = ({
  changingPass, setPass, pass,
  showOldPass, setShowOldPass,
  showNewPass, setShowNewPass,
  showConfirmPass, setShowConfirmPass,
  handleChangePassword,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 2: Security */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Security</span>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-foreground text-sm">Change Password</h3>
                  <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">Update your account password regularly to keep your shop secure.</p>
                </div>
                <div className="relative flex items-center">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50 pointer-events-none" />
                  <Input type={showOldPass ? "text" : "password"} placeholder="Current Password" className="pl-11 pr-11 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" value={pass.old} onChange={(e) => setPass({ ...pass, old: e.target.value })} />
                  <button type="button" onClick={() => setShowOldPass(p => !p)} className="absolute right-3.5 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showOldPass ? "Hide password" : "View password"}>
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative flex items-center">
                    <Input type={showNewPass ? "text" : "password"} placeholder="New Password" value={pass.new} onChange={(e) => setPass({ ...pass, new: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showNewPass ? "Hide password" : "View password"}>
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Input type={showConfirmPass ? "text" : "password"} placeholder="Confirm New Password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowConfirmPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showConfirmPass ? "Hide password" : "View password"}>
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="button" disabled={changingPass} onClick={handleChangePassword}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20 hover:border-primary shadow-sm">
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Shield className="w-4 h-4 shrink-0" />}
                  Update Password
                </button>
              </div>
            </div>
          </div>
  );
};
