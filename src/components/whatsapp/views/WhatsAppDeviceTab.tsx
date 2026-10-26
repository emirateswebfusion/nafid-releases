import { Smartphone, Check, PowerOff, CheckCircle2, WifiSync, RefreshCw, QrCode } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface WhatsAppDeviceTabProps {
  handleConnect: () => Promise<void>;
  handleTabSelect: (tab: "qr" | "settings" | "closing") => void;
  wa: WhatsAppSettingsState;
}

/** Device tab: connection status, QR code to link, connected device details and disconnect. */
export function WhatsAppDeviceTab({
  handleConnect, handleTabSelect, wa,
}: WhatsAppDeviceTabProps) {
  const { loading, phone, qrCode, setShowConfirmDisconnect, status } = wa;
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {status === 'connected' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
          {/* Card 1: Active Device Details */}
          <div className="p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative inline-block mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 flex items-center justify-center mx-auto shadow-sm">
                <Smartphone className="w-10 h-10" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-4 ring-card">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-foreground">Active WhatsApp Device</h4>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-sm">
                <span>+{phone}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                Invoices, bill PDFs, party ledger alerts, and shop closing reports are actively sent from this number.
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={loading}
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30 px-5 py-2.5 rounded-xl cursor-pointer"
              >
                <PowerOff className="w-4 h-4 mr-2" />
                Disconnect Number
              </Button>
            </div>
          </div>

          {/* Card 2: Status & Features Overview */}
          <div className="p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                <span>Connection Active &amp; Ready</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your WhatsApp session is running smoothly in the background. Messages dispatch directly over your local session with no extra subscription fees.
              </p>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Instant High-Res PDF invoice dispatch on checkout</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Automated ledger transaction debit/credit notifications</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-foreground/90 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Daily Shop Closing &amp; Cash Reconciliation summary to owner</span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-card border border-border/60 text-xs text-muted-foreground flex items-center justify-between">
              <span>Want to configure Shop Closing Overview?</span>
              <button
                type="button"
                onClick={() => handleTabSelect('closing')}
                className="text-xs font-bold text-primary hover:underline cursor-pointer"
              >
                Open Shop Closing &rarr;
              </button>
            </div>
          </div>
        </div>
      ) : status === 'syncing' ? (
        <div className="py-16 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-4 w-full">
          <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border-2 border-blue-500 text-blue-500 flex items-center justify-center mx-auto">
            <WifiSync className="w-10 h-10 animate-spin" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="text-base font-bold text-foreground">Synchronizing WhatsApp Session</h4>
            <p className="text-xs text-muted-foreground">
              Device authenticated successfully. Initializing encryption keys and session cache&hellip;
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              Please keep the app open. This takes only a few seconds.
            </p>
          </div>
        </div>
      ) : qrCode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-6 md:p-8 rounded-2xl bg-muted/20 border border-border/80 w-full">
          <div className="lg:col-span-5 flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-white rounded-3xl shadow-lg border border-border/80 inline-block">
              <img src={qrCode} alt="WhatsApp QR Code" className="w-60 h-60 object-contain mx-auto" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              disabled={loading || status === 'connecting'}
              className="text-xs px-5 py-2 rounded-xl cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh QR Code
            </Button>
          </div>

          <div className="lg:col-span-7 space-y-5 text-left">
            <div className="space-y-1">
              <h4 className="text-base font-bold text-foreground">Scan with WhatsApp on your Phone</h4>
              <p className="text-xs text-muted-foreground">
                Connect your mobile phone to enable automated PDF bills, ledger alerts, and daily closing overviews.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/70 space-y-3">
              <span className="text-xs font-bold text-foreground block">Follow these 3 steps:</span>
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Open WhatsApp on your mobile device.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Go to <strong>Settings</strong> (iPhone) or tap <strong>Menu ⋮</strong> (Android) &gt; <strong>Linked Devices</strong>.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Tap <strong>Link a Device</strong> and point your phone&apos;s camera at the QR code.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-16 rounded-2xl bg-muted/20 border border-border/80 flex flex-col items-center justify-center text-center space-y-5 w-full">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto shadow-xs">
            <QrCode className="w-10 h-10" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h4 className="text-base font-bold text-foreground">Link Your WhatsApp Number</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send high-resolution digital invoice PDFs, credit reminders, ledger transaction alerts, and daily shop closing summaries.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={handleConnect}
              disabled={loading || status === 'connecting'}
              className="text-xs font-bold px-7 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm"
            >
              <QrCode className="w-4 h-4 mr-2" />
              {loading
                ? 'Initializing...'
                : status === 'connecting'
                ? 'Please Wait...'
                : 'Generate WhatsApp QR Code'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
