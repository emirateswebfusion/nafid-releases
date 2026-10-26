import React from 'react';
import clsx from 'clsx';
import { CheckCircle2, AlertCircle, RefreshCw, Save, Server } from 'lucide-react';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomSettingsTabProps {
  checkConnection: (url?: string) => Promise<void>;
  handleSaveSettings: (e: React.FormEvent) => Promise<void>;
  ec: EcommerceState;
}

/** Store settings tab: storefront details, delivery and payment options. */
export function EcomSettingsTab({
  checkConnection, handleSaveSettings, ec,
}: EcomSettingsTabProps) {
  const { savingSettings, setSettingsForm, settingsForm, settingsMsg, testingConnection } = ec;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 animate-in fade-in duration-200">
      <div className="lg:col-span-8 rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-foreground tracking-tight">FusionCart Marketplace Configuration</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure the remote API endpoint, merchant connection URL, and public store profile parameters.
          </p>
        </div>

        {settingsMsg && (
          <div className={clsx(
            "rounded-xl p-3.5 text-xs flex items-center gap-2.5 border",
            settingsMsg.type === 'success'
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
          )}>
            {settingsMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{settingsMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="text-xs font-semibold block mb-1 text-foreground">FusionCart API Gateway URL *</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={settingsForm.fusioncart_url}
                onChange={e => setSettingsForm({ ...settingsForm, fusioncart_url: e.target.value })}
                className="flex-1 px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono font-medium text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
              <button
                type="button"
                disabled={testingConnection}
                onClick={() => checkConnection(settingsForm.fusioncart_url)}
                className="px-4 py-2 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {testingConnection ? 'Pinging...' : 'Test Connection'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Default local instance: <code>http://localhost:5050/api</code></p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1 text-foreground">Public Store Name</label>
              <input
                type="text"
                value={settingsForm.store_name}
                onChange={e => setSettingsForm({ ...settingsForm, store_name: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1 text-foreground">Store Slug URL</label>
              <input
                type="text"
                value={settingsForm.store_slug}
                onChange={e => setSettingsForm({ ...settingsForm, store_slug: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1 text-foreground">Store Description</label>
            <textarea
              rows={3}
              value={settingsForm.store_description}
              onChange={e => setSettingsForm({ ...settingsForm, store_description: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1 text-foreground">Support Email</label>
              <input
                type="email"
                value={settingsForm.contact_email}
                onChange={e => setSettingsForm({ ...settingsForm, contact_email: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1 text-foreground">Support Phone</label>
              <input
                type="text"
                value={settingsForm.contact_phone}
                onChange={e => setSettingsForm({ ...settingsForm, contact_phone: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {savingSettings ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Marketplace Settings</span>
            </button>
          </div>
        </form>
      </div>

      {/* Right Info Card */}
      <div className="lg:col-span-4 space-y-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <span>Sync Engine Architecture</span>
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            FusionCart syncs stock and price updates automatically via background delta workers. POS retail operations continue uninterrupted even during internet outages.
          </p>
          <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-2">
            <div className="flex justify-between">
              <span>Local POS Database:</span>
              <strong className="text-foreground">SQLite / LocalDB</strong>
            </div>
            <div className="flex justify-between">
              <span>Remote Cluster:</span>
              <strong className="text-foreground">Postgres Multi-Tenant</strong>
            </div>
            <div className="flex justify-between">
              <span>Offline Queue:</span>
              <strong className="text-emerald-500 font-bold">Enabled</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
