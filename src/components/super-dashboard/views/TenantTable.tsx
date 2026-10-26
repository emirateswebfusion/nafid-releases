import React from 'react';
import { Loader2, Database, KeyRound, EyeOff, Eye, Check, Copy, RefreshCw, CheckCircle2, XCircle, Cloud, Edit } from 'lucide-react';
import type { TenantAdmin } from '../superDashboardTypes';
import type { SuperDashboardState } from '../hooks/useSuperDashboardState';

export interface TenantTableProps {
  filteredAdmins: TenantAdmin[];
  getDomainIcon: (type: string) => React.JSX.Element;
  getDomainName: (type: string) => "Jewelry Retail" | "Hardware & Tools" | "Supermarket / Grocery" | "General Retail";
  handleCopy: (text: string, id: string, type: string) => void;
  handleOpenCloudAccessModal: (admin: TenantAdmin) => Promise<void>;
  handleOpenEditModal: (admin: TenantAdmin) => void;
  togglePasswordReveal: (id: string) => void;
  toggleUrlReveal: (tenantId: string) => void;
  sd: SuperDashboardState;
}

/** Tenant table: health, masked credentials with reveal / copy, and row actions (edit, cloud access, WhatsApp). */
export function TenantTable({
  filteredAdmins, getDomainIcon, getDomainName, handleCopy, handleOpenCloudAccessModal, handleOpenEditModal,
  togglePasswordReveal, toggleUrlReveal, sd,
}: TenantTableProps) {
  const { connectionHealth, copiedText, loading, revealedPasswords, revealedUrls, setVerificationModalOpen, setVerificationTenantId, unmaskedCredentials } = sd;
  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {loading ? (
        <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="font-mono text-xs uppercase tracking-widest">Loading tenant administrative registry...</span>
        </div>
      ) : filteredAdmins.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <Database className="h-10 w-10 text-muted-foreground mb-2 opacity-50" />
          <span className="text-foreground font-semibold">No admin records match the criteria</span>
          <span className="text-xs">Adjust filters or provision a new store database context.</span>
        </div>
      ) : (
        <div className="overflow-x-auto font-sans">
          <table className="min-w-full divide-y divide-border text-left">
            <thead className="bg-muted/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
              <tr>
                <th className="px-6 py-4">Shop details</th>
                <th className="px-6 py-4">Owner account</th>
                <th className="px-6 py-4">Database target host</th>
                <th className="px-6 py-4">Neon console credentials</th>
                <th className="px-6 py-4">DB latency / status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-foreground">
              {filteredAdmins.map(admin => {
                // Extract host from connection string
                let dbHost = 'Local/Custom';
                try {
                  if (admin.db_connection_string.includes('@')) {
                    dbHost = admin.db_connection_string.split('@')[1].split('/')[0].split(':')[0];
                  }
                } catch { /* ignore */ }

                const health = connectionHealth[admin.tenant_id] || 'checking';
                const isPwdRevealed = !!revealedPasswords[admin.tenant_id];
                const isUrlRevealed = !!revealedUrls[admin.tenant_id];

                return (
                  <tr key={admin.tenant_id} className="hover:bg-muted/30 transition duration-150 group">
                    
                    {/* Column 1: Shop details */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center">
                          {getDomainIcon(admin.domain_type)}
                        </div>
                        <div className="whitespace-nowrap">
                          <span className="font-bold text-foreground block text-sm group-hover:text-amber-500 transition">{admin.name}</span>
                          <span className="text-[10px] text-muted-foreground block font-mono mt-0.5 select-all">{admin.tenant_id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Owner details */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs">
                        <span className="text-foreground block font-medium">{admin.owner_email}</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground border border-border mt-1 uppercase tracking-wide">
                          {getDomainName(admin.domain_type)}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: DB Host URL */}
                    <td className="px-6 py-4 font-mono text-xs">
                      <div className="flex items-center gap-1.5 max-w-xs">
                        {!unmaskedCredentials[admin.tenant_id] ? (
                          <button
                            onClick={() => {
                              setVerificationTenantId(admin.tenant_id);
                              setVerificationModalOpen(true);
                            }}
                            className="text-amber-500 hover:text-amber-400 p-0.5 cursor-pointer flex items-center gap-1 text-[10px] font-mono border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 rounded animate-pulse"
                            title="Unlock Sensitive Connection Details"
                          >
                            <KeyRound className="h-3 w-3" /> Unlock
                          </button>
                        ) : (
                          <>
                            <span className="truncate text-muted-foreground block" title={unmaskedCredentials[admin.tenant_id].db_connection_string}>
                              {isUrlRevealed ? unmaskedCredentials[admin.tenant_id].db_connection_string : dbHost}
                            </span>
                            <button
                              onClick={() => toggleUrlReveal(admin.tenant_id)}
                              className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                              title={isUrlRevealed ? "Hide Connection String" : "Reveal Connection String"}
                            >
                              {isUrlRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].db_connection_string, admin.tenant_id, 'url')}
                              className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                              title="Copy URL"
                            >
                              {copiedText?.id === admin.tenant_id && copiedText?.type === 'url' ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Column 4: Neon Credentials */}
                    <td className="px-6 py-4">
                      {admin.neon_mail_id ? (
                        <div className="text-xs space-y-1">
                          {!unmaskedCredentials[admin.tenant_id] ? (
                            <button
                              onClick={() => {
                                setVerificationTenantId(admin.tenant_id);
                                setVerificationModalOpen(true);
                              }}
                              className="text-amber-500 hover:text-amber-400 p-0.5 cursor-pointer flex items-center gap-1 text-[10px] font-mono border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 rounded animate-pulse"
                              title="Unlock Sensitive Connection Details"
                            >
                              <KeyRound className="h-3 w-3" /> Unlock
                            </button>
                          ) : (
                            <>
                              <div className="flex items-center gap-1 font-mono text-muted-foreground">
                                <span>{unmaskedCredentials[admin.tenant_id].neon_mail_id}</span>
                                <button
                                  onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].neon_mail_id || '', admin.tenant_id, 'mail')}
                                  className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                >
                                  {copiedText?.id === admin.tenant_id && copiedText?.type === 'mail' ? (
                                    <Check className="h-2.5 w-2.5 text-emerald-550" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-muted-foreground/60">
                                <span className="select-all">
                                  {isPwdRevealed ? unmaskedCredentials[admin.tenant_id].neon_password : '••••••••'}
                                </span>
                                <button
                                  onClick={() => togglePasswordReveal(admin.tenant_id)}
                                  className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                >
                                  {isPwdRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].neon_password || '', admin.tenant_id, 'pwd')}
                                  className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                >
                                  {copiedText?.id === admin.tenant_id && copiedText?.type === 'pwd' ? (
                                    <Check className="h-2.5 w-2.5 text-emerald-550" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Column 5: Status indicators */}
                    <td className="px-6 py-4">
                      {health === 'checking' && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <RefreshCw className="h-3 w-3 animate-spin text-amber-500" /> pinging...
                        </span>
                      )}
                      {health === 'healthy' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Healthy
                        </span>
                      )}
                      {health === 'unreachable' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                          <XCircle className="h-3 w-3" /> Error
                        </span>
                      )}
                    </td>

                    {/* Column 6: Edit & Cloud Access buttons */}
                    <td className="px-6 py-4 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => handleOpenCloudAccessModal(admin)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/90 font-semibold bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/20 transition cursor-pointer"
                      >
                        <Cloud className="h-3.5 w-3.5" /> Cloud Access
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(admin)}
                        className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-amber-550 font-semibold bg-muted hover:bg-amber-500/10 px-3 py-1.5 rounded-lg border border-border hover:border-amber-500/20 transition cursor-pointer"
                      >
                        <Edit className="h-3.5 w-3.5" /> Configure
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
