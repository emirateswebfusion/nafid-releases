import { useState, useEffect } from 'react';
import { Settings, Printer, Scale, Save, Loader2, Info, Layout, ShoppingCart, Wrench, Gem, RefreshCw, Download, Lock, Key } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function SettingsManager({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [printer, setPrinter] = useState<any>({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '' });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const [osPrinters, setOsPrinters] = useState<any[]>([]);
  const { shopDomain } = useCartStore();
  const { role, updateDomain } = useAuthStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [localDomain, setLocalDomain] = useState(shopDomain || 'GENERAL');
  const [pass, setPass] = useState({ old: '', new: '', confirm: '' });
  const [changingPass, setChangingPass] = useState(false);
  const [appVersion, setAppVersion] = useState('v1.0.0');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const p = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'printer_config' });
      const s = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'scale_config' });
      if (p) setPrinter({ type: 'usb', ip: '192.168.1.100', port: 9100, deviceName: '', ...p });
      if (s) setScale(s);
      
      try {
        const pr = await window.electronAPI.getPrinters();
        setOsPrinters(pr || []);
      } catch (err) {
        console.error('Failed to get printers', err);
      }
      
      try {
        const v = await window.electronAPI.appGetVersion();
        if (v) setAppVersion(`v${v}`);
      } catch (err) {
        console.error('Failed to get app version', err);
      }
      
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (window.electronAPI) {
        const { tenantId } = useAuthStore.getState();
        
        // Update Domain if changed
        if (localDomain !== shopDomain && role === 'OWNER') {
          const res = await updateDomain(localDomain);
          if (!res.success) throw new Error(res.error);
        }

        // Format numbers correctly before saving
        const formattedPrinter = {
          ...printer,
          port: Number(printer.port) || 9100,
          labelWidthMm: Number(printer.labelWidthMm) || 50,
          labelHeightMm: Number(printer.labelHeightMm) || 25,
          labelColumns: Number(printer.labelColumns) || 1,
        };

        const resPrinter = await window.electronAPI.settingsSet({ 
          tenant_id: tenantId || 'global', 
          key: 'printer_config', 
          value: formattedPrinter 
        });
        if (!resPrinter.success) throw new Error(resPrinter.error);
        
        const resScale = await window.electronAPI.settingsSet({ 
          tenant_id: tenantId || 'global', 
          key: 'scale_config', 
          value: scale 
        });
        if (!resScale.success) throw new Error(resScale.error);

        setMessage({ type: 'success', text: `Saved! USB Printer: ${printer.deviceName || 'None'}. Please restart app.` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to save settings: ' + err.message });
    }
    setSaving(false);
  };

  const handleCheckUpdate = async () => {
    if (!window.electronAPI) return;
    setCheckingUpdate(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.appCheckForUpdates();
      if (res && res.success === false) {
        setMessage({ type: 'error', text: res.error });
      } else {
        setMessage({ type: 'success', text: 'Update check complete. Please check for notification if an update is available.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Update check failed: ${err.message || 'Unknown error'}` });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.old || !pass.new) {
      setMessage({ type: 'error', text: 'Current and new passwords are required.' });
      return;
    }
    if (pass.new !== pass.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setChangingPass(true);
    setMessage(null);
    try {
      const { changePassword } = useAuthStore.getState();
      const res = await changePassword(pass.old, pass.new);
      if (res.success) {
        setMessage({ type: 'success', text: 'Password updated successfully!' });
        setPass({ old: '', new: '', confirm: '' });
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update password.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold">Settings</div>
            <div className="text-xs text-muted-foreground font-normal">Configure your hardware, domain, and system updates</div>
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading configurations...</p>
          </div>
        ) : (
          <>
            {/* Business Domain Section (Only for Owners) */}
            {role === 'OWNER' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-foreground">
                  <Layout className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-lg">Business Configuration</h3>
                </div>
                <p className="text-sm text-muted-foreground">Updating this will change how Vendora handles products and hardware connections for your entire shop.</p>
                
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: 'GENERAL', name: 'Retail', icon: ShoppingCart },
                    { id: 'HARDWARE', name: 'Hardware', icon: Wrench },
                    { id: 'JEWELRY', name: 'Jewelry', icon: Gem }
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setLocalDomain(d.id as any)}
                      className={clsx(
                        "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all",
                        localDomain === d.id 
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-background border-border text-muted-foreground hover:border-muted-foreground/50"
                      )}
                    >
                      <d.icon className="w-6 h-6" />
                      <span className="text-xs font-bold uppercase tracking-widest">{d.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {role === 'OWNER' && <div className="h-px bg-border" />}

            {/* Printer Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 text-foreground">
                <Printer className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Thermal Printer (ESC/POS)</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Connection Type</label>
                  <select
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                    value={printer.type || 'network'}
                    onChange={(e) => setPrinter({...printer, type: e.target.value})}
                  >
                    <option value="network">Network (TCP/IP)</option>
                    <option value="usb">USB (OS Print Queue)</option>
                  </select>
                </div>
                
                {printer.type === 'network' ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Printer IP Address</label>
                      <Input 
                        type="text"
                        value={printer.ip}
                        onChange={(e) => setPrinter({...printer, ip: e.target.value})}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Port</label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        value={printer.port ?? 9100}
                        onChange={(e) => setPrinter({...printer, port: e.target.value === '' ? '' : e.target.value.replace(/\\D/g, '')})}
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Select USB Printer</label>
                    <select
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                      value={printer.deviceName || ''}
                      onChange={(e) => setPrinter({...printer, deviceName: e.target.value})}
                    >
                      <option value="">-- Select a printer --</option>
                      {osPrinters.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {printer.type === 'usb' && (
                  <div className="col-span-2 grid grid-cols-3 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Label Width (mm)</label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        value={printer.labelWidthMm ?? 50}
                        onChange={(e) => setPrinter({...printer, labelWidthMm: e.target.value === '' ? '' : e.target.value.replace(/\\D/g, '')})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Label Height (mm)</label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        value={printer.labelHeightMm ?? 25}
                        onChange={(e) => setPrinter({...printer, labelHeightMm: e.target.value === '' ? '' : e.target.value.replace(/\\D/g, '')})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Label Columns</label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        value={printer.labelColumns ?? 1}
                        onChange={(e) => setPrinter({...printer, labelColumns: e.target.value === '' ? '' : e.target.value.replace(/\\D/g, '')})}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* Weighing Scale Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 text-foreground">
                <Scale className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Electronic Weighing Scale</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Serial Port (COM/tty)</label>
                  <Input 
                    type="text"
                    value={scale.path}
                    onChange={(e) => setScale({...scale, path: e.target.value})}
                    placeholder="COM3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Baud Rate</label>
                  <select
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                    value={scale.baudRate}
                    onChange={(e) => setScale({...scale, baudRate: parseInt(e.target.value)})}
                  >
                    <option value="2400">2400</option>
                    <option value="4800">4800</option>
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400">38400</option>
                    <option value="115200">115200</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* Version & Update Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-foreground">
                  <RefreshCw className={clsx("w-5 h-5 text-primary", checkingUpdate && "animate-spin")} />
                  <div>
                    <h3 className="font-bold text-lg">System Updates</h3>
                    <p className="text-xs text-muted-foreground">Current Version: {appVersion}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="flex items-center gap-2"
                >
                  {checkingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                </Button>
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* Security Section */}
            <section className="space-y-4 pb-4">
              <div className="flex items-center gap-3 text-foreground">
                <Lock className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Security</h3>
              </div>
              
              <form onSubmit={handleChangePassword} className="space-y-4 bg-muted/50 p-6 rounded-2xl border border-border">
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-widest">Change Password</p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      type="password"
                      placeholder="Current Password"
                      className="pl-11"
                      value={pass.old}
                      onChange={(e) => setPass({...pass, old: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      type="password"
                      placeholder="New Password"
                      value={pass.new}
                      onChange={(e) => setPass({...pass, new: e.target.value})}
                    />
                    <Input 
                      type="password"
                      placeholder="Confirm New Password"
                      value={pass.confirm}
                      onChange={(e) => setPass({...pass, confirm: e.target.value})}
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  disabled={changingPass}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Update Password
                </Button>
              </form>
            </section>

            {message && (
              <div className={clsx(
                "p-4 rounded-2xl border flex gap-3 text-sm animate-in fade-in slide-in-from-top-2",
                message.type === 'success' ? "bg-primary/10 border-primary/30 text-primary" : "bg-destructive/10 border-destructive/30 text-destructive"
              )}>
                <Info className="w-5 h-5 shrink-0" />
                <p>{message.text}</p>
              </div>
            )}
            
            <div className="pt-4 flex justify-end gap-3 border-t border-border">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Configuration
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
