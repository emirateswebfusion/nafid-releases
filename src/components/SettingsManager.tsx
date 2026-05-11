import { useState, useEffect } from 'react';
import { X, Settings, Printer, Scale, Save, Loader2, Info, Layout, ShoppingCart, Wrench, Gem, RefreshCw, Download, Lock, Key } from 'lucide-react';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';

export function SettingsManager({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [printer, setPrinter] = useState({ type: 'network', ip: '192.168.1.100', port: 9100 });
  const [scale, setScale] = useState({ path: 'COM3', baudRate: 9600 });
  const { shopDomain, setDomain } = useCartStore();
  const { role, updateDomain } = useAuthStore();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [localDomain, setLocalDomain] = useState(shopDomain || 'GENERAL');
  const [pass, setPass] = useState({ old: '', new: '', confirm: '' });
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (window.electronAPI) {
      const { tenantId } = useAuthStore.getState();
      const p = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'printer_config' });
      const s = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'scale_config' });
      if (p) setPrinter(p);
      if (s) setScale(s);
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

        await window.electronAPI.settingsSet({ 
          tenant_id: tenantId || 'global', 
          key: 'printer_config', 
          value: printer 
        });
        await window.electronAPI.settingsSet({ 
          tenant_id: tenantId || 'global', 
          key: 'scale_config', 
          value: scale 
        });
        setMessage({ type: 'success', text: 'Settings saved successfully! Please restart the app to apply hardware changes.' });
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
      await window.electronAPI.appCheckForUpdates();
      setMessage({ type: 'success', text: 'Update check initiated. Please check for notification.' });
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-neutral-800 text-neutral-400 rounded-2xl">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Settings</h1>
              <p className="text-neutral-500 text-sm">Configure your hardware, domain, and system updates</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-neutral-500">Loading configurations...</p>
            </div>
          ) : (
            <>
              {/* Business Domain Section (Only for Owners) */}
              {role === 'OWNER' && (
                <section className="space-y-4">
                  <div className="flex items-center gap-3 text-white">
                    <Layout className="w-5 h-5 text-blue-400" />
                    <h3 className="font-bold text-lg">Business Configuration</h3>
                  </div>
                  <p className="text-sm text-neutral-500">Updating this will change how Vendora handles products and hardware connections for your entire shop.</p>
                  
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
                            ? "bg-blue-500/10 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/5"
                            : "bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                        )}
                      >
                        <d.icon className="w-6 h-6" />
                        <span className="text-xs font-bold uppercase tracking-widest">{d.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {role === 'OWNER' && <div className="h-px bg-neutral-800" />}

              {/* Printer Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-white">
                  <Printer className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-lg">Thermal Printer (ESC/POS)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Printer IP Address</label>
                    <input 
                      type="text"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                      value={printer.ip}
                      onChange={(e) => setPrinter({...printer, ip: e.target.value})}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Port</label>
                    <input 
                      type="number"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                      value={printer.port}
                      onChange={(e) => setPrinter({...printer, port: parseInt(e.target.value) || 9100})}
                    />
                  </div>
                </div>
              </section>

              <div className="h-px bg-neutral-800" />

              {/* Weighing Scale Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 text-white">
                  <Scale className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-lg">Electronic Weighing Scale</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Serial Port (COM/tty)</label>
                    <input 
                      type="text"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all"
                      value={scale.path}
                      onChange={(e) => setScale({...scale, path: e.target.value})}
                      placeholder="COM3"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Baud Rate</label>
                    <select
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all appearance-none"
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

              <div className="h-px bg-neutral-800" />

              {/* Version & Update Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-white">
                    <RefreshCw className={clsx("w-5 h-5 text-purple-400", checkingUpdate && "animate-spin")} />
                    <div>
                      <h3 className="font-bold text-lg">System Updates</h3>
                      <p className="text-xs text-neutral-500">Current Version: v1.0.0</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {checkingUpdate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                  </button>
                </div>
              </section>

              <div className="h-px bg-neutral-800" />

              {/* Security Section */}
              <section className="space-y-4 pb-4">
                <div className="flex items-center gap-3 text-white">
                  <Lock className="w-5 h-5 text-orange-400" />
                  <h3 className="font-bold text-lg">Security</h3>
                </div>
                
                <form onSubmit={handleChangePassword} className="space-y-4 bg-neutral-950 p-6 rounded-2xl border border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-widest">Change Password</p>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                      <input 
                        type="password"
                        placeholder="Current Password"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 pl-11 text-white text-sm focus:outline-none focus:border-orange-500 transition-all"
                        value={pass.old}
                        onChange={(e) => setPass({...pass, old: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="password"
                        placeholder="New Password"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-all"
                        value={pass.new}
                        onChange={(e) => setPass({...pass, new: e.target.value})}
                      />
                      <input 
                        type="password"
                        placeholder="Confirm New Password"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-all"
                        value={pass.confirm}
                        onChange={(e) => setPass({...pass, confirm: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={changingPass}
                    className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Update Password
                  </button>
                </form>
              </section>

              {message && (
                <div className={clsx(
                  "p-4 rounded-2xl border flex gap-3 text-sm animate-in fade-in slide-in-from-top-2",
                  message.type === 'success' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"
                )}>
                  <Info className="w-5 h-5 shrink-0" />
                  <p>{message.text}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="p-6 border-t border-neutral-800 bg-neutral-900/50 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Configuration
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
