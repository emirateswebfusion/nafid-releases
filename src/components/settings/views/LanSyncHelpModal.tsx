import { Modal } from '../../ui/Modal';
import { Wifi, Monitor, Smartphone, Shield, Check, Copy, Clock, CheckCircle2 } from 'lucide-react';
import type { SettingsFormState } from '../hooks/useSettingsFormState';

export interface LanSyncHelpModalProps {
  form: SettingsFormState;
}

/** Step-by-step help for connecting terminals over LAN / Wi-Fi (host IP, firewall command, connect code). */
export function LanSyncHelpModal({
  form,
}: LanSyncHelpModalProps) {
  const { copiedFirewallCmd, detectedLocalIp, networkDetails, setCopiedFirewallCmd, setShowLanHelpModal, showLanHelpModal } = form;
  return (
    <Modal
      isOpen={showLanHelpModal}
      onClose={() => setShowLanHelpModal(false)}
      title="📖 Wi-Fi / LAN Sync — Easy Step-by-Step Setup Guide"
      size="lg"
    >
      <div className="space-y-4 text-left text-foreground py-1">
        {/* Top Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-primary">Simple Wi-Fi Sync Guide (A to Z)</h4>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium leading-relaxed">
              Follow these 5 simple steps one by one to connect all your store billing computers over Wi-Fi.
            </p>
          </div>
        </div>

        {/* 1st Step Card */}
        <div className="p-4.5 rounded-2xl border border-blue-500/25 bg-blue-500/[0.03] space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-blue-500/15 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                1st Step
              </span>
              <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-blue-500 shrink-0" />
                Set Up Computer A (Main Host PC)
              </h5>
            </div>
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">PRIMARY HOST</span>
          </div>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
            <li>Open <strong>Nafid POS</strong> on Computer A → Go to <strong>Settings ⚙️ → Network &amp; Sync Settings</strong>.</li>
            <li>Set <strong>Sync Mode</strong> to <strong>`HYBRID`</strong> <em>(Recommended)</em> or <strong>`LAN`</strong>.</li>
            <li>Set <strong>LAN Role</strong> to <strong>`PRIMARY (Master Server)`</strong>.</li>
            <li>Note down Computer A's <strong>Local IP Address</strong> displayed on screen (e.g. <span className="font-mono text-foreground font-bold px-1 py-0.5 bg-muted rounded">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</span>).</li>
            <li>Click <strong>Save Settings</strong>.</li>
          </ol>
        </div>

        {/* 2nd Step Card */}
        <div className="p-4.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-500/15 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                2nd Step
              </span>
              <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
                Set Up Computer B (Secondary Billing PC)
              </h5>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">CLIENT TERMINAL</span>
          </div>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
            <li>Open <strong>Nafid POS</strong> on Computer B → Go to <strong>Settings ⚙️ → Network &amp; Sync Settings</strong>.</li>
            <li>Set <strong>Sync Mode</strong> to <strong>`HYBRID`</strong> or <strong>`LAN`</strong>.</li>
            <li>Set <strong>LAN Role</strong> to <strong>`SECONDARY (Client Terminal)`</strong>.</li>
            <li>In the <strong>Primary Host IP</strong> field, type Computer A's IP address (e.g. <span className="font-mono text-foreground font-bold px-1 py-0.5 bg-muted rounded">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</span>).</li>
            <li>Click <strong>Test Connection</strong>. When it shows green success, click <strong>Save Settings</strong>.</li>
          </ol>
        </div>

        {/* 3rd Step Card */}
        <div className="p-4.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                3rd Step
              </span>
              <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                Run Firewall Rule on ALL PCs (EVERY Computer)
              </h5>
            </div>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">PORT 3888</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Run this command in <strong>PowerShell as Administrator</strong> on <strong>EVERY computer</strong> using local sync so Windows Firewall allows communication:
          </p>
          <div className="p-3 bg-zinc-950 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">PowerShell Command</span>
              <button
                type="button"
                onClick={() => {
                  const cmd = 'New-NetFirewallRule -DisplayName "Nafid POS Local Sync (Port 3888)" -Direction Inbound -LocalPort 3888 -Protocol TCP -Action Allow -Profile Any';
                  navigator.clipboard.writeText(cmd);
                  setCopiedFirewallCmd(true);
                  setTimeout(() => setCopiedFirewallCmd(false), 2500);
                }}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[10px] rounded-lg transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 shadow-sm"
              >
                {copiedFirewallCmd ? <Check className="w-3.5 h-3.5 text-zinc-950" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFirewallCmd ? 'Copied to Clipboard!' : 'Copy'}</span>
              </button>
            </div>
            <code className="block text-emerald-400 font-mono text-[11px] overflow-x-auto select-all leading-relaxed">
              New-NetFirewallRule -DisplayName "Nafid POS Local Sync (Port 3888)" -Direction Inbound -LocalPort 3888 -Protocol TCP -Action Allow -Profile Any
            </code>
          </div>
        </div>

        {/* 4th Step Card */}
        <div className="p-4.5 rounded-2xl border border-purple-500/25 bg-purple-500/[0.03] space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-purple-500/15 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                4th Step
              </span>
              <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-500 shrink-0" />
                Lock Computer A's IP in Windows (30 Seconds)
              </h5>
            </div>
            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">NO ROUTER NEEDED</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed">
            Lock Computer A's IP address directly inside Windows Settings so it never changes when router reboots:
          </p>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4 font-medium leading-relaxed">
            <li>On <strong>Computer A</strong>, open <strong>Windows Settings</strong> (press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[10px] font-mono">Win + I</kbd>) → <strong>Network &amp; Internet</strong> → <strong>Wi-Fi</strong>.</li>
            <li>Click your Wi-Fi Network Name → Scroll down to <strong>IP assignment</strong> → Click <strong>Edit</strong>.</li>
            <li>Change from <strong>Automatic (DHCP)</strong> to <strong>Manual</strong> → Turn <strong>ON IPv4</strong>.</li>
            <li>Fill in the real network details auto-detected for this computer:
              <div className="mt-1.5 p-3 rounded-xl bg-card border border-border/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div><span className="text-muted-foreground">IP address:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.ip || detectedLocalIp || '192.168.1.100'}</strong></div>
                <div><span className="text-muted-foreground">Subnet mask:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.netmask || '255.255.255.0'}</strong> <span className="text-[10px] text-muted-foreground">(or Prefix: {networkDetails.subnetPrefix || '24'})</span></div>
                <div><span className="text-muted-foreground">Gateway (Router IP):</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.gateway || '192.168.1.1'}</strong></div>
                <div><span className="text-muted-foreground">Preferred DNS:</span> <strong className="text-purple-600 dark:text-purple-400">{networkDetails.dns || '8.8.8.8'}</strong></div>
              </div>
            </li>
            <li>Click <strong>Save</strong>. Computer A's IP address is now permanently locked!</li>
          </ol>
        </div>

        {/* 5th Step Card */}
        <div className="p-4.5 rounded-2xl border border-sky-500/25 bg-sky-500/[0.03] space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-sky-500/15 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                5th Step
              </span>
              <h5 className="text-xs font-black text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
                Test &amp; Start Billing!
              </h5>
            </div>
            <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">READY</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4 font-medium leading-relaxed">
            <li>Print a test bill on Computer A or Computer B. It will appear on both screens instantly!</li>
            <li>Click the <strong>Syncing</strong> button at the top-right header anytime to force an immediate manual refresh.</li>
            <li>Ensure your Wi-Fi network profile is set to <strong>Private Network</strong> on both PCs.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
