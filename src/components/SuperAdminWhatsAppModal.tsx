import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PowerOff,
  ShieldCheck,
  Loader2,
  X,
  Radio,
} from 'lucide-react';
import clsx from 'clsx';
import { superAdminCloud } from '../data/cloud/superAdmin';
import { WhatsAppIcon } from './ui/WhatsAppIcon';

interface SuperAdminWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SuperAdminWhatsAppModal: React.FC<SuperAdminWhatsAppModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'syncing' | 'connected'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const pollIntervalRef = useRef<any>(null);

  const fetchStatus = async () => {
    try {
      const res = await superAdminCloud.whatsappStatus();
      if (res) {
        setStatus(res.status);
        setQrCode(res.qrCode || null);
        setPhone(res.phone || null);
        if (res.status === 'connected') {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to get Super Admin WhatsApp status:', err);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    fetchStatus();

    // Poll status every 3 seconds while modal is open
    pollIntervalRef.current = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen]);

  const handleConnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await superAdminCloud.whatsappConnect();
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setStatus(res.status || 'connecting');
        if (res.qrCode) setQrCode(res.qrCode);
        setSuccessMsg('QR code generated. Scan with WhatsApp on your phone.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to start WhatsApp connection');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmDisconnect(false);
    try {
      const res = await superAdminCloud.whatsappDisconnect();
      if (res.success) {
        setStatus('disconnected');
        setQrCode(null);
        setPhone(null);
        setSuccessMsg('WhatsApp device disconnected successfully.');
      } else {
        setErrorMsg(res.error || 'Failed to disconnect');
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <WhatsAppIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                Super Admin WhatsApp Link
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  OTP Gateway
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dedicated WhatsApp connection for customer mobile app login OTPs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Status Banner */}
          <div
            className={clsx(
              'p-4 rounded-xl border flex items-center justify-between',
              status === 'connected' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
              status === 'connecting' && 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
              status === 'syncing' && 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
              status === 'disconnected' && 'bg-muted border-border text-muted-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              {status === 'connected' ? (
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : status === 'connecting' || status === 'syncing' ? (
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-muted-foreground/10 text-muted-foreground">
                  <PowerOff className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  {status === 'connected'
                    ? 'Connected & Ready'
                    : status === 'syncing'
                    ? 'Syncing Session...'
                    : status === 'connecting'
                    ? 'Waiting for QR Scan'
                    : 'Disconnected'}
                </div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  {phone ? `Phone: ${phone}` : 'No device linked yet'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchStatus}
                className="p-2 rounded-lg border border-border hover:bg-background text-foreground transition"
                title="Refresh Status"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* QR Code Scan Area */}
          {status !== 'connected' && (
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl bg-muted/20 space-y-4">
              {qrCode ? (
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-3 bg-white rounded-2xl shadow-xl border border-zinc-200">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg object-contain" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse">
                    <Radio className="w-3.5 h-3.5" />
                    Waiting for scan from phone camera...
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-3 py-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Link Super Admin Phone</h4>
                    <p className="text-xs text-muted-foreground max-w-xs mt-1">
                      Click below to generate a QR code. Scan it from WhatsApp on your smartphone.
                    </p>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer text-xs"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating QR Code...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        Generate Pairing QR Code
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Connected Device Card */}
          {status === 'connected' && (
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-500">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Active Gateway Device</h4>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {phone || 'Linked & Authenticated'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-card border border-border rounded-xl text-xs space-y-1.5 text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Protocol:</span>
                  <span className="font-mono text-foreground font-semibold">Baileys Native Web</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Delivery Scope:</span>
                  <span className="font-semibold text-emerald-500">Platform-Wide OTPs</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rate Limit:</span>
                  <span className="font-mono text-foreground">60s cooldown / 5m expiry</span>
                </div>
              </div>

              {confirmDisconnect ? (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl space-y-2">
                  <p className="text-xs text-destructive font-medium">
                    Are you sure? Customers will not be able to log into mobile app until a device is re-linked.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="px-3 py-1.5 bg-destructive text-destructive-foreground font-bold rounded-lg text-xs"
                    >
                      Yes, Disconnect
                    </button>
                    <button
                      onClick={() => setConfirmDisconnect(false)}
                      className="px-3 py-1.5 bg-muted text-foreground rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="w-full py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 font-semibold rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  Disconnect WhatsApp Device
                </button>
              )}
            </div>
          )}

          {/* Instructions Step-by-Step */}
          <div className="p-4 bg-muted/40 rounded-xl border border-border space-y-2">
            <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Pairing Instructions
            </h5>
            <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 pl-1">
              <li>Open WhatsApp on the Super Admin smartphone</li>
              <li>Tap <strong>Settings / More options</strong> &rarr; <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong> and point your camera at the QR code</li>
              <li>The device will automatically link and start dispatching customer OTPs</li>
            </ol>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl border border-border transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
