import React from 'react';
import { Cloud, Wifi, CheckCircle2, Globe, HelpCircle, RefreshCw, BookOpen, ChevronRight, Lock } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { hasBridge } from '../../../data/client';
import { syncApi } from '../../../data/sync';

export interface NetworkSyncTabProps {
  activeSection: string;
  appVersion: string;
  detectedLocalIp: string;
  drainingQueue: boolean; setDrainingQueue: (v: boolean) => void;
  effectiveCloudState: any; setEffectiveCloudState: (v: any) => void;
  lanHostIp: string; setLanHostIp: (v: string) => void;
  lanRole: any; setLanRole: (v: any) => void;
  lanPort: number | string;
  saving: boolean;
  setActiveHardwareTab: (v: any) => void;
  setActiveProductsTab: (v: any) => void;
  setActiveSection: (v: string) => void;
  setShowBulkSheet: (v: boolean) => void;
  showBulkSheet: boolean;
  showLanHelpModal: boolean; setShowLanHelpModal: (v: boolean) => void;
  syncFrequency: any; setSyncFrequency: (v: any) => void;
  syncMode: any; setSyncMode: (v: any) => void;
  testingNetwork: boolean; setTestingNetwork: (v: boolean) => void;
  copiedFirewallCmd: boolean; setCopiedFirewallCmd: (v: boolean) => void;
  networkDetails: any; setNetworkDetails: (v: any) => void;
  setMessage: (msg: any) => void;
}

export const NetworkSyncTab: React.FC<NetworkSyncTabProps> = ({
  activeSection,
  appVersion,
  detectedLocalIp,
  drainingQueue, setDrainingQueue,
  effectiveCloudState, setEffectiveCloudState,
  lanHostIp, setLanHostIp,
  lanRole, setLanRole,
  lanPort,
  saving,
  setActiveHardwareTab,
  setActiveProductsTab,
  setActiveSection,
  setShowBulkSheet,
  showBulkSheet,
  showLanHelpModal, setShowLanHelpModal,
  syncFrequency, setSyncFrequency,
  syncMode, setSyncMode,
  testingNetwork, setTestingNetwork,
  copiedFirewallCmd, setCopiedFirewallCmd,
  networkDetails, setNetworkDetails,
  setMessage,
}) => {
  const handleManualQueueDrain = async () => {
    if (!hasBridge('drainPendingCloudQueue')) return;
    setDrainingQueue(true);
    try {
      const res = await syncApi.drainPendingCloudQueue();
      if (res.success) {
        setMessage({ type: 'success', text: 'Queue drain completed' });
      } else {
        setMessage({ type: 'error', text: `Queue drain error: ${res.error || 'Failed'}` });
      }
      if (hasBridge('getCloudAccessState')) {
        const newState = await syncApi.getCloudAccessState();
        if (newState) setEffectiveCloudState(newState);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Queue drain error: ${err.message}` });
    } finally {
      setDrainingQueue(false);
    }
  };

  const handleTestNetworkConnection = async () => {
    setTestingNetwork(true);
    setMessage({ type: 'success', text: 'Testing network connection...' });
    const cleanHost = lanHostIp.trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
    const port = Number(lanPort) || 3888;

    try {
      if (hasBridge('testNetworkConnection')) {
        const result = await syncApi.testNetworkConnection({
          syncMode,
          lanRole,
          lanHostIp: cleanHost,
          lanPort: port,
        });
        if (result.ok) {
          setMessage({ type: 'success', text: result.message || 'Connection test successful' });
        } else {
          setMessage({ type: 'error', text: result.error || 'Connection failed' });
        }
      } else {
        // Cloud API URL — set VITE_CLOUD_API in .env
        const defaultCloud = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');
        if (syncMode === 'LAN' || syncMode === 'HYBRID') {
          if (lanRole === 'PRIMARY') {
            const hostIp = detectedLocalIp || cleanHost || '192.168.1.100';
            setMessage({
              type: 'success',
              text: `Wifi Sync Active — This PC is Primary Master Server (IP: ${hostIp}, Port ${port})`
            });
          } else {
            const host = cleanHost || '192.168.1.100';
            try {
              const res = await fetch(`http://${host}:${port}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
              if (res.ok) {
                setMessage({
                  type: 'success',
                  text: `Wifi Sync Active — Connected to Primary Master Server (${host})`
                });
              } else if (syncMode === 'HYBRID') {
                try {
                  const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
                  if (cloudRes.ok) {
                    setMessage({
                      type: 'success',
                      text: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) returned status ${res.status}. Syncing via Cloud API.`
                    });
                  } else {
                    setMessage({
                      type: 'error',
                      text: `Sync Inactive — Master Server (${host}) returned status ${res.status} & Cloud API unreachable.`
                    });
                  }
                } catch {
                  setMessage({
                    type: 'error',
                    text: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
                  });
                }
              } else {
                setMessage({
                  type: 'error',
                  text: `Sync Inactive — Master Server (${host}) returned status ${res.status}`
                });
              }
            } catch {
              if (syncMode === 'HYBRID') {
                try {
                  const cloudRes = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
                  if (cloudRes.ok) {
                    setMessage({
                      type: 'success',
                      text: `Cloud Sync Active (Hybrid Fallback) — LAN Master Server (${host}) unreachable. Automatically syncing via Cloud API!`
                    });
                  } else {
                    setMessage({
                      type: 'error',
                      text: `Sync Inactive — Could not connect to Master Server at ${host}:${port} or Cloud API. Operating offline.`
                    });
                  }
                } catch {
                  setMessage({
                    type: 'error',
                    text: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
                  });
                }
              } else {
                setMessage({
                  type: 'error',
                  text: `Sync Inactive — Could not connect to Master Server at ${host}:${port}. Ensure PC 1 is on, POS is open & Windows Firewall allows Port 3888.`
                });
              }
            }
          }
        } else {
          try {
            const res = await fetch(`${defaultCloud}/health`, { method: 'GET', signal: AbortSignal.timeout(3500) });
            if (res.ok) {
              setMessage({
                type: 'success',
                text: `Cloud Sync Active — Connected to Cloud API server`
              });
            } else {
              setMessage({
                type: 'error',
                text: `Sync Inactive — Could not reach Cloud API server (${defaultCloud}). Operating in Offline Mode.`
              });
            }
          } catch {
            setMessage({
              type: 'error',
              text: `Sync Inactive — Could not reach Cloud API server (${defaultCloud}). Operating in Offline Mode.`
            });
          }
        }
      }
    } finally {
      setTestingNetwork(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <Wifi className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-foreground uppercase tracking-widest block">Network & Connectivity Mode</span>
                    <span className="text-[11px] text-muted-foreground font-medium">Choose how POS terminals sync all store data (Products, Invoices, Stock, Customers & Ledger)</span>
                  </div>
                </div>

                {/* Question Mark (?) Help Button with Hover Tooltip */}
                <div className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLanHelpModal(true)}
                    className="p-2.5 rounded-2xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 transition-all duration-200 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
                    title="View Wi-Fi / LAN Sync Setup Manual"
                  >
                    <HelpCircle className="w-4.5 h-4.5" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider hidden sm:inline">Setup Manual</span>
                  </button>

                  {/* Hover Tooltip Card */}
                  <div className="absolute right-0 top-12 w-72 p-4 bg-popover border border-border rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-40 space-y-2 text-left backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <BookOpen className="w-4 h-4 text-primary shrink-0" />
                      <span>Wi-Fi / LAN Setup Manual</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Step-by-step guide to connect Primary Host &amp; Secondary Billing Terminals over Wi-Fi, setup firewall rules, and fix connection issues.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowLanHelpModal(true)}
                      className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-extrabold rounded-xl uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 mt-1 shadow-sm"
                    >
                      <span>Open Complete Guide</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Effective Cloud Access Status Banner */}
              {effectiveCloudState && (
                <div className="mb-6 p-4 rounded-2xl border bg-muted/20 border-border space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx(
                        "p-2 rounded-xl text-white font-bold shrink-0",
                        effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' ? "bg-emerald-500" :
                        effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' ? "bg-amber-500" : "bg-slate-600"
                      )}>
                        <Cloud className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-foreground">
                            {effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' && 'Cloud Sync Allowed & Active'}
                            {effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' && 'Cloud Sync Paused — Local DB & LAN Sync Active'}
                            {effectiveCloudState.stateName === 'LOCAL_ONLY' && 'Local-Only Operational Mode'}
                          </h4>
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide",
                            effectiveCloudState.stateName === 'LOCAL_PLUS_CLOUD' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                            effectiveCloudState.stateName === 'LOCAL_WITH_PENDING_CLOUD_QUEUE' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse" :
                            "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                          )}>
                            {effectiveCloudState.stateName}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {effectiveCloudState.activeReason} • Outbox Pending: <strong>{effectiveCloudState.pendingCount}</strong> records
                        </p>
                      </div>
                    </div>

                    {effectiveCloudState.isCloudAllowed && effectiveCloudState.pendingCount > 0 && (
                      <button
                        type="button"
                        onClick={handleManualQueueDrain}
                        disabled={drainingQueue}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={clsx("w-3.5 h-3.5", drainingQueue && "animate-spin")} />
                        {drainingQueue ? 'Draining Queue...' : `Drain Queue (${effectiveCloudState.pendingCount})`}
                      </button>
                    )}
                  </div>

                  {effectiveCloudState.config?.cloud_access_enabled === false && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Cloud Sync Access is disabled by Super Admin for this store. Local database operations and LAN synchronization remain fully available.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mode Selector Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Option 1: Cloud Sync */}
                <button
                  type="button"
                  onClick={() => setSyncMode('CLOUD')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'CLOUD'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    {syncMode === 'CLOUD' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Cloud API Sync</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Direct internet sync to cloud API. Best for multi-branch stores or remote monitoring.</p>
                  </div>
                </button>

                {/* Option 2: Local Wi-Fi Direct (LAN) */}
                <button
                  type="button"
                  onClick={() => setSyncMode('LAN')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'LAN'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Wifi className="w-5 h-5 text-emerald-500" />
                    {syncMode === 'LAN' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Local Wi-Fi Direct (LAN)</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Direct terminal-to-terminal Wi-Fi sync for all store data. Zero internet cost & sub-1ms speed.</p>
                  </div>
                </button>

                {/* Option 3: Hybrid Smart Mode */}
                <button
                  type="button"
                  onClick={() => setSyncMode('HYBRID')}
                  className={clsx(
                    'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3',
                    syncMode === 'HYBRID'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 text-muted-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <RefreshCw className="w-5 h-5 text-amber-500" />
                    {syncMode === 'HYBRID' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground mb-1">Hybrid Smart Mode</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed">Auto-detects local Wi-Fi for instant in-store data sync; falls back to cloud API when remote.</p>
                  </div>
                </button>
              </div>

              {/* LAN Configuration Settings */}
              {(syncMode === 'LAN' || syncMode === 'HYBRID') && (
                <div className="p-5 bg-muted/30 border border-border rounded-2xl space-y-4 mb-6 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Local Store Server & Data Sync Settings</h4>
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Full Database Sync</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Terminal Role</label>
                      <Select
                        value={lanRole}
                        onChange={(val) => {
                          setLanRole(val as any);
                          if (val === 'PRIMARY' && detectedLocalIp) setLanHostIp(detectedLocalIp);
                        }}
                        options={[
                          { value: 'PRIMARY', label: 'Primary Master Server (Main Store PC - Syncs All Data)' },
                          { value: 'SECONDARY', label: 'Secondary Store Terminal (Connects to Master PC)' },
                        ]}
                      />
                    </div>
                    {lanRole === 'PRIMARY' ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">This PC (Master Server) Local IP Address</label>
                        <div className="flex items-center gap-2 p-2.5 bg-background border border-border rounded-xl font-mono text-xs font-bold text-primary">
                          <span>{detectedLocalIp || lanHostIp || '192.168.1.100'}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full ml-auto">Server Host</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Primary Master Server (PC 1) IP Address</label>
                        <Input
                          type="text"
                          value={lanHostIp}
                          onChange={(e) => setLanHostIp(e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="font-mono text-xs font-semibold"
                        />
                      </div>
                    )}
                  </div>

                  {lanRole === 'PRIMARY' ? (
                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex items-center gap-2.5">
                      <span className="text-xs shrink-0">💡</span>
                      <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                        Enter this IP address <strong className="text-primary font-bold">{detectedLocalIp || lanHostIp || '192.168.1.100'}</strong> on Secondary Store Terminals (PC 2) so they connect to this Master Server.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs shrink-0">💡</span>
                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                          Enter the exact IP address displayed on Primary PC 1 (Settings → Network &amp; Connectivity).
                        </p>
                      </div>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pl-6">
                        If Wi-Fi test fails: Ensure Windows Firewall on PC 1 allows Port 3888, Wi-Fi profile is set to Private, or select <strong>Hybrid Smart Mode</strong>.
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-medium">
                    * Real-time synchronization of all store data: Invoices, Products, Stock, Inventory, Customers, Ledger &amp; Cashier settlement across all terminals.
                  </p>
                </div>
              )}

              {/* Heartbeat Sync Frequency */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">Sync Heartbeat Rate</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'NORMAL', label: 'Normal (60s)', desc: 'Lowest data usage & maximum server efficiency' },
                    { id: 'BALANCED', label: 'Balanced (30s)', desc: 'Standard multi-terminal store sync' },
                    { id: 'HIGH', label: 'Power Sync (15s)', desc: 'Fastest refresh for heavy checkout counters' },
                  ].map((rate) => (
                    <button
                      key={rate.id}
                      type="button"
                      onClick={() => setSyncFrequency(rate.id as any)}
                      className={clsx(
                        'p-3.5 rounded-xl border text-left transition-all cursor-pointer',
                        syncFrequency === rate.id
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-border bg-background hover:border-primary/30 text-muted-foreground'
                      )}
                    >
                      <span className="text-xs font-bold block">{rate.label}</span>
                      <span className="text-[10px] opacity-75 mt-0.5 block">{rate.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Network Health Check & Live Toast Notification Action */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center justify-between gap-4 mt-6">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Test Network Connection</h4>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                    Click to test connectivity and trigger live status toast notification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTestNetworkConnection}
                  disabled={testingNetwork}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", testingNetwork && "animate-spin")} />
                  <span>{testingNetwork ? 'Testing Connection...' : 'Test Connection Status'}</span>
                </button>
              </div>
            </div>
          </div>
  );
};
