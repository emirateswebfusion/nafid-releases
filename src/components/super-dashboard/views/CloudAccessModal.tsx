import { Cloud, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';
import clsx from 'clsx';
import type { TenantAdmin } from '../superDashboardTypes';
import type { SuperDashboardState } from '../hooks/useSuperDashboardState';

export interface CloudAccessModalProps {
  handleAddScheduleWindow: () => void;
  handleRemoveScheduleWindow: (id: string) => void;
  handleSaveCloudAccess: () => Promise<void>;
  handleUpdateScheduleWindow: (id: string, field: string, value: unknown) => void;
  /** Rendered only while it is set. */
  /** Rendered only while it is set. */
  selectedCloudTenant: TenantAdmin;
  sd: SuperDashboardState;
}

/** Cloud access and schedule control dialog for one tenant: access switch, schedule windows, manual override, save. */
export function CloudAccessModal({
  selectedCloudTenant, handleAddScheduleWindow, handleRemoveScheduleWindow, handleSaveCloudAccess, handleUpdateScheduleWindow, sd,
}: CloudAccessModalProps) {
  const { cloudAccessEnabled, cloudAccessMsg, cloudManualOverride, cloudScheduleEnabled, cloudSchedules, savingCloudAccess, setCloudAccessEnabled, setCloudManualOverride, setCloudModalOpen, setCloudScheduleEnabled } = sd;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            Super Admin Cloud Access & Schedule Control — {selectedCloudTenant.name}
          </h3>
          <RedCrossButton onClick={() => setCloudModalOpen(false)} />
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Permission Toggle */}
          <div className="p-4 bg-muted/30 border border-border rounded-xl flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-foreground block">Grant Cloud Access Permission</label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                When disabled, Cloud API requests and polling stop. Local DB operation & Local LAN Sync continue normally.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCloudAccessEnabled(!cloudAccessEnabled)}
              className={clsx(
                "relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0",
                cloudAccessEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"
              )}
            >
              <span className={clsx("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform", cloudAccessEnabled ? "translate-x-6" : "translate-x-0")} />
            </button>
          </div>

          {/* Manual Override Option */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Manual Override Mode</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'AUTO', label: 'AUTO (Schedules)', desc: 'Follows time windows if enabled' },
                { id: 'FORCE_ON', label: 'FORCE ON', desc: 'Keep Cloud Sync ON 24/7' },
                { id: 'FORCE_OFF', label: 'FORCE OFF', desc: 'Force Cloud Sync OFF (Queue changes)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCloudManualOverride(opt.id as 'AUTO' | 'FORCE_ON' | 'FORCE_OFF')}
                  className={clsx(
                    "p-3 rounded-xl border text-left cursor-pointer transition",
                    cloudManualOverride === opt.id
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border bg-background hover:border-primary/30 text-muted-foreground"
                  )}
                >
                  <span className="text-xs font-bold block">{opt.label}</span>
                  <span className="text-[10px] opacity-75 mt-0.5 block">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Windows Management */}
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Cloud Access Schedules (Up to 24 windows/day)</h4>
                <p className="text-[11px] text-muted-foreground">Configure specific daily time windows when Cloud Sync is permitted.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-foreground cursor-pointer flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={cloudScheduleEnabled}
                    onChange={(e) => setCloudScheduleEnabled(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  Enable Schedules
                </label>
                <button
                  type="button"
                  onClick={handleAddScheduleWindow}
                  disabled={cloudSchedules.length >= 24}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Window ({cloudSchedules.length}/24)
                </button>
              </div>
            </div>

            {cloudSchedules.length === 0 ? (
              <div className="p-4 bg-muted/20 border border-border rounded-xl text-center text-xs text-muted-foreground">
                No schedule windows configured. Cloud sync operates 24/7 when Cloud Access permission is ON.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {cloudSchedules.map((win, idx) => (
                  <div key={win.id || idx} className="p-3 bg-muted/30 border border-border rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={win.enabled}
                        onChange={(e) => handleUpdateScheduleWindow(win.id, 'enabled', e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary cursor-pointer"
                        title="Toggle Schedule Window Active"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Start:</span>
                        <input
                          type="time"
                          value={win.startTime}
                          onChange={(e) => handleUpdateScheduleWindow(win.id, 'startTime', e.target.value)}
                          className="bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">End:</span>
                        <input
                          type="time"
                          value={win.endTime}
                          onChange={(e) => handleUpdateScheduleWindow(win.id, 'endTime', e.target.value)}
                          className="bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveScheduleWindow(win.id)}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg border border-destructive/20 transition cursor-pointer"
                      title="Delete Schedule Window"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cloudAccessMsg && (
            <div className={clsx("p-3 rounded-xl text-xs font-bold border", cloudAccessMsg.startsWith('Error') ? "bg-red-500/10 border-red-500/20 text-red-600" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600")}>
              {cloudAccessMsg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleSaveCloudAccess}
            disabled={savingCloudAccess}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            {savingCloudAccess ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Configuration</span>
          </button>
        </div>
      </div>
    </div>
  );
}
