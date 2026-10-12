import React, { useState, useEffect } from 'react';
import { MessageSquare, QrCode, Smartphone, CheckCircle2, AlertCircle, RefreshCw, PowerOff, ShieldCheck } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { FloatToast, type ToastMessage } from './ui/FloatToast';
import { WhatsAppIcon } from './ui/WhatsAppIcon';

interface WhatsAppSettingsProps {
  tenantId?: string;
  autoSendEnabled: boolean;
  onAutoSendChange: (val: boolean) => void;
}

export const WhatsAppSettings: React.FC<WhatsAppSettingsProps> = ({
  autoSendEnabled,
  onAutoSendChange,
}) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    // Initial status check
    if (window.electronAPI?.whatsappGetStatus) {
      window.electronAPI.whatsappGetStatus().then((res) => {
        if (res) {
          setStatus(res.status);
          setQrCode(res.qrCode);
          setPhone(res.phone);
        }
      }).catch(console.error);
    }

    // Subscribe to real-time status updates
    if (window.electronAPI?.onWhatsAppStatusUpdate) {
      const unsubscribe = window.electronAPI.onWhatsAppStatusUpdate((data) => {
        setStatus(data.status);
        setQrCode(data.qrCode);
        setPhone(data.phone);
        if (data.status === 'connected') {
          setLoading(false);
          setMsg({ text: 'WhatsApp connected successfully!', type: 'success' });
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await window.electronAPI.whatsappConnect();
      if (!res.success) {
        setMsg({ text: 'Failed to initiate WhatsApp connection', type: 'error' });
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Connection error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState<boolean>(false);

  const handleDisconnect = async () => {
    setShowConfirmDisconnect(false);
    setLoading(true);
    try {
      await window.electronAPI.whatsappDisconnect();
      setStatus('disconnected');
      setQrCode(null);
      setPhone(null);
      setMsg({ text: 'WhatsApp disconnected successfully', type: 'success' });
    } catch (err: any) {
      setMsg({ text: err?.message || 'Disconnect error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
            <WhatsAppIcon className="w-5 h-5 text-emerald-500 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              WhatsApp Integration & Automation
            </h3>
            <p className="text-xs text-muted-foreground">
              Send digital invoices, payment reminders, reports, and alerts directly from your shop's WhatsApp number
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected ({phone || 'Ready'})
            </span>
          ) : status === 'connecting' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Waiting for Scan...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
              Not Connected
            </span>
          )}
        </div>
      </div>

      {/* Connection Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: QR code & actions */}
        <div className="p-6 rounded-2xl bg-card border border-border/80 flex flex-col items-center justify-center text-center space-y-4">
          {status === 'connected' ? (
            <div className="py-6 space-y-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 flex items-center justify-center mx-auto">
                <Smartphone className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">Active WhatsApp Device</h4>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  Linked Phone: <span className="font-bold text-emerald-500">+{phone}</span>
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-2 max-w-xs mx-auto">
                  Invoices and credit payment reminders will be automatically sent from this number.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={loading}
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                Disconnect Number
              </Button>
            </div>
          ) : qrCode ? (
            <div className="space-y-4">
              <div className="p-3 bg-white rounded-xl shadow-md inline-block border border-border">
                <img src={qrCode} alt="Scan QR Code" className="w-56 h-56" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Scan with WhatsApp</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Open WhatsApp on your phone &gt; Settings / Menu &gt; Linked Devices &gt; Link a Device
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleConnect} disabled={loading} className="text-xs">
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh QR Code
              </Button>
            </div>
          ) : (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <QrCode className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Link Your WhatsApp Number</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Connect your business or personal mobile number without paying any external messaging API costs.
                </p>
              </div>
              <Button onClick={handleConnect} disabled={loading} className="text-xs font-bold px-6">
                <QrCode className="w-4 h-4 mr-2" />
                {loading ? 'Initializing...' : 'Generate WhatsApp QR Code'}
              </Button>
            </div>
          )}
        </div>

        {/* Right: Automation Settings & Guidance */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-card border border-border/80 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Automated Bill Options
            </h4>

            {/* Toggle Auto Send */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer border border-border/50">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => onAutoSendChange(e.target.checked)}
                className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary border-border"
              />
              <div className="flex-1 text-left">
                <span className="text-xs font-bold text-foreground block">
                  Auto-send WhatsApp Bill on Checkout
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Whenever a customer phone number is present, instantly send the PDF invoice and bill summary.
                </span>
              </div>
            </label>

            <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
              <h5 className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                What does the customer receive?
              </h5>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>Professional High-Res PDF invoice document</li>
                <li>Itemized summary (items, quantity & total)</li>
                <li>Credit period & Due date reminders (for credit bills)</li>
                <li>Ledger balance details</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Disconnect Confirmation Dialog */}
      <Modal
        isOpen={showConfirmDisconnect}
        onClose={() => setShowConfirmDisconnect(false)}
        title="Disconnect WhatsApp"
        className="max-w-md rounded-[24px]"
      >
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <PowerOff className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                Disconnect Linked Device?
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to disconnect WhatsApp number <span className="font-mono font-bold text-foreground">+{phone}</span>? Automated PDF bills and reminders will pause until reconnected.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmDisconnect(false)}
              className="text-xs font-semibold px-4 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={loading}
              className="text-xs font-bold px-4 rounded-xl"
            >
              <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              {loading ? 'Disconnecting...' : 'Yes, Disconnect'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating Toast Notification */}
      <FloatToast message={msg} onClose={() => setMsg(null)} duration={3500} />
    </div>
  );
};
