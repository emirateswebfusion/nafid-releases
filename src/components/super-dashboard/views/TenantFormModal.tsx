import React from 'react';
import { Database, Terminal, Loader2, ShieldAlert, Globe, User, EyeOff, Eye, Server, KeyRound, RefreshCw, CheckCircle2, Info } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';
import type { SuperDashboardState } from '../hooks/useSuperDashboardState';

export interface TenantFormModalProps {
  handleExecuteProvisioning: (e: React.FormEvent) => Promise<void>;
  handleTestConnection: () => Promise<void>;
  sd: SuperDashboardState;
}

/** Create / edit tenant dialog: shop, owner and database fields, connection test, and provisioning progress / logs. */
export function TenantFormModal({
  handleExecuteProvisioning, handleTestConnection, sd,
}: TenantFormModalProps) {
  const { dbConnectionString, domainType, editingAdmin, formError, neonMailId, neonPassword, ownerEmail, ownerName, ownerPassword, provisionLogs, provisionProgress, provisionStatus, setDbConnectionString, setDomainType, setModalOpen, setNeonMailId, setNeonPassword, setOwnerEmail, setOwnerName, setOwnerPassword, setProvisionProgress, setProvisionStatus, setShopName, setShowOwnerPassword, shopName, showOwnerPassword, testError, testStatus } = sd;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-5xl rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Modal Title */}
        <div className="px-6 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Database className="h-4.5 w-4.5 text-amber-500" />
            {editingAdmin ? `Configure Tenant: ${editingAdmin.name}` : 'Provision New Store Workspace'}
          </h2>
          <RedCrossButton onClick={() => setModalOpen(false)} />
        </div>

        {/* Interactive Progress Visualizer Logs Terminal */}
        {provisionStatus !== 'idle' ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-white font-mono">deployment_pipeline_log</span>
              </div>
              <div className="flex items-center gap-2">
                {provisionStatus === 'provisioning' && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-500 font-mono">
                    <Loader2 className="h-3 w-3 animate-spin" /> executing... {provisionProgress}%
                  </span>
                )}
                {provisionStatus === 'success' && (
                  <span className="text-xs text-emerald-400 font-mono font-bold">● SUCCESSFUL</span>
                )}
                {provisionStatus === 'failed' && (
                  <span className="text-xs text-rose-405 font-mono font-bold">● FAILED</span>
                )}
              </div>
            </div>

            {/* Live pipeline progress bar */}
            {provisionStatus === 'provisioning' && (
              <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: `${provisionProgress}%` }}
                />
              </div>
            )}

            {/* Log Terminal Screen */}
            <div className="bg-black/95 rounded-lg border border-zinc-800 p-4 h-[380px] overflow-y-auto font-mono text-[11px] text-zinc-400 space-y-1.5 scrollbar-thin">
              {provisionLogs.map((log, index) => {
                const isLast = index === provisionLogs.length - 1;
                let color = 'text-zinc-400';
                if (log.includes('✅') || log.includes('🎉') || log.includes('SUCCESS')) {
                  color = 'text-emerald-400';
                } else if (log.includes('❌') || log.includes('failed')) {
                  color = 'text-rose-450 font-semibold';
                } else if (log.includes('🔌') || log.includes('🛰️') || log.includes('⚙️')) {
                  color = 'text-amber-500/90';
                }
                return (
                  <div key={index} className={`${color} leading-relaxed break-all`}>
                    {log}
                    {isLast && provisionStatus === 'provisioning' && (
                      <span className="ml-1.5 inline-block h-3 w-1.5 bg-amber-400 animate-pulse align-middle" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Failure State Info */}
            {provisionStatus === 'failed' && (
              <div className="text-xs text-rose-455 bg-rose-955/20 border border-rose-900/30 p-2.5 rounded-lg flex items-start gap-2.5">
                <ShieldAlert className="h-4.5 w-4.5 text-rose-550 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">Deployment error occurred</span>
                  <span>{formError || 'The schema build or authentication record failed. Verify your database connection string and network permissions.'}</span>
                </div>
              </div>
            )}

            {/* Console controller buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              {provisionStatus === 'failed' && (
                <button
                  type="button"
                  onClick={() => { setProvisionStatus('idle'); setProvisionProgress(0); }}
                  className="px-4 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition cursor-pointer"
                >
                  Back to Configuration
                </button>
              )}
              {provisionStatus === 'success' && (
                <span className="text-xs text-muted-foreground font-mono flex items-center">
                  Finalizing workspace registry reload...
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleExecuteProvisioning} className="px-6 py-4 space-y-4">
            {formError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Grid Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Shop / Business Name</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gourmet Bakeries"
                    className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200"
                    value={shopName}
                    onChange={e => setShopName(e.target.value)}
                  />
                </div>
              </div>

              <div className="md:col-span-1">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Business Domain Type</label>
                <select
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200 cursor-pointer"
                  value={domainType}
                  onChange={e => setDomainType(e.target.value)}
                >
                  <option value="GENERAL">General Retail</option>
                  <option value="JEWELRY">Jewelry Shop</option>
                  <option value="HARDWARE">Hardware Shop</option>
                  <option value="GROCERY">Grocery Store</option>
                </select>
              </div>
            </div>

            {/* Owner Account Details - Hidden when editing */}
            {!editingAdmin && (
              <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-2.5">
                <h3 className="text-[11px] font-bold text-foreground flex items-center gap-1.5 font-mono uppercase tracking-wide">
                  <User className="h-3.5 w-3.5 text-amber-500" /> Admin Owner Account
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">OWNER NAME</label>
                    <input
                      type="text"
                      placeholder="Owner Name"
                      className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                      value={ownerName}
                      onChange={e => setOwnerName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">LOGIN EMAIL</label>
                    <input
                      type="email"
                      required
                      placeholder="admin@shop.com"
                      className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                      value={ownerEmail}
                      onChange={e => setOwnerEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">ACCESS PASSWORD</label>
                    <div className="relative">
                      <input
                        type={showOwnerPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••••••"
                        className="w-full pl-3 pr-9 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                        value={ownerPassword}
                        onChange={e => setOwnerPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showOwnerPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Neon cloud credentials */}
            <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-2.5">
              <h3 className="text-[11px] font-bold text-foreground flex items-center gap-1.5 font-mono uppercase tracking-wide">
                <Server className="h-3.5 w-3.5 text-amber-500" /> Neon Console Credentials (Optional)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">NEON MAIL ID</label>
                  <input
                    type="email"
                    placeholder="neon-email@example.com"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                    value={neonMailId}
                    onChange={e => setNeonMailId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">NEON PASSWORD</label>
                  <input
                    type="text"
                    placeholder="Neon password"
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs font-mono"
                    value={neonPassword}
                    onChange={e => setNeonPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Database credentials & Test Side-by-side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Neon Connection URI</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    placeholder="postgresql://owner:password@ep-endpoint.us-east.neon.tech/neondb?sslmode=require"
                    className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground/30 font-mono text-xs focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200"
                    value={dbConnectionString}
                    onChange={e => setDbConnectionString(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="lg:col-span-1 bg-muted/30 px-3 py-1.5 rounded-lg border border-border flex items-center justify-between gap-2 h-[34px]">
                <div className="text-[10px] truncate flex-1">
                  {testStatus === 'idle' && <span className="text-muted-foreground/75 font-mono">Not tested yet.</span>}
                  {testStatus === 'testing' && <span className="text-muted-foreground font-mono flex items-center gap-1"><RefreshCw className="h-2.5 w-2.5 animate-spin text-amber-500" /> verifying...</span>}
                  {testStatus === 'success' && <span className="text-emerald-500 dark:text-emerald-400 font-mono flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3 shrink-0" /> Ready.</span>}
                  {testStatus === 'failed' && <span className="text-destructive font-mono truncate block" title={testError}>✕ Failed</span>}
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="px-2 py-0.5 bg-background hover:bg-muted border border-border rounded text-[10px] font-bold text-foreground transition cursor-pointer shrink-0"
                >
                  Test Connection
                </button>
              </div>
            </div>
            <p className="text-muted-foreground text-[9px] font-mono flex items-center gap-1 -mt-1.5">
              <Info className="h-3 w-3 text-muted-foreground/75 shrink-0" />
              Data isolation container. Copy from your Neon Console settings page.
            </p>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2.5 border-t border-border">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg shadow-lg shadow-amber-500/10 transition cursor-pointer text-xs"
              >
                {editingAdmin ? 'Update Settings' : 'Create & Provision'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
