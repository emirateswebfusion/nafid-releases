import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, QrCode, Send } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { restaurantApi, type QrResult } from '../../../data/restaurant';
import { getSetting } from '../../../data/settings';

interface QrWhatsAppModalProps {
  tenantId: string;
  tableId?: string | null;
  tableLabel?: string | null;
  orderType?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  shopName?: string;
  onClose: () => void;
}

export function QrWhatsAppModal({
  tenantId,
  tableId,
  tableLabel,
  orderType = 'DINE_IN',
  shopName = 'Restaurant',
  onClose,
}: QrWhatsAppModalProps) {
  const [selectedMode, setSelectedMode] = useState<'DINE_IN' | 'DELIVERY'>(
    orderType === 'DELIVERY' ? 'DELIVERY' : 'DINE_IN'
  );
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState<QrResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [shopNameInput, setShopNameInput] = useState(shopName);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isDelivery = selectedMode === 'DELIVERY';
  const effectiveTableId = isDelivery ? null : tableId;
  const effectiveTableLabel = isDelivery ? null : tableLabel;

  useEffect(() => {
    let active = true;
    void getSetting<string>({ tenant_id: tenantId || 'global', key: 'shop_name' }).then(val => {
      if (active && typeof val === 'string' && val.trim()) {
        setShopNameInput(val.trim());
      }
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadQr() {
      setLoading(true);
      try {
        const res = await restaurantApi.generateTableQr({
          tenant_id: tenantId,
          table_id: effectiveTableId || null,
          table_label: effectiveTableLabel || null,
          order_type: selectedMode,
        });
        if (active && res && res.success) {
          setQrData(res);
        }
      } catch (err) {
        console.error('Failed to generate QR:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadQr();
    return () => {
      active = false;
    };
  }, [tenantId, effectiveTableId, effectiveTableLabel, selectedMode]);

  const handleCopy = async () => {
    if (!qrData?.url) return;
    try {
      await navigator.clipboard.writeText(qrData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard write failure in unsupported contexts
    }
  };

  const handleSendWhatsApp = async () => {
    if (!phone.trim() || !qrData?.url) return;
    setSending(true);
    setStatusMessage(null);

    try {
      const res = await restaurantApi.sendTableWhatsApp({
        phone: phone.trim(),
        url: qrData.url,
        shop_name: shopNameInput.trim() || 'Restaurant',
        table_label: effectiveTableLabel || null,
        order_type: selectedMode,
      });

      if (res && res.success && res.wa_url) {
        setStatusMessage('Opening WhatsApp...');
        window.open(res.wa_url, '_blank');
      } else {
        setStatusMessage('Failed to prepare WhatsApp dispatch.');
      }
    } catch {
      setStatusMessage('Error sending WhatsApp message.');
    } finally {
      setSending(false);
    }
  };

  const title = isDelivery
    ? 'Home Delivery Menu QR & WhatsApp'
    : effectiveTableLabel
      ? `Digital Menu QR - Table ${effectiveTableLabel}`
      : 'Digital Menu QR & WhatsApp';

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex w-full rounded-xl bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => setSelectedMode('DINE_IN')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              selectedMode === 'DINE_IN'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🍽️ Dine-In {tableLabel ? `(${tableLabel})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode('DELIVERY')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              selectedMode === 'DELIVERY'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🛵 Home Delivery
          </button>
        </div>
        {loading ? (
          <div className="flex h-56 w-56 animate-pulse items-center justify-center rounded-2xl bg-muted">
            <QrCode className="h-12 w-12 text-muted-foreground animate-spin" />
          </div>
        ) : qrData ? (
          <>
            <div className="rounded-2xl border-2 border-primary/20 bg-card p-3 shadow-sm">
              <img src={qrData.qr_code} alt="Table Ordering QR" className="h-52 w-52 rounded-xl object-contain" />
            </div>

            <div className="w-full space-y-1.5 text-center">
              <span className="text-xs font-bold text-muted-foreground">
                {isDelivery ? 'Direct Home Delivery Link' : 'Direct Customer Ordering Link'}
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 px-3">
                <input
                  readOnly
                  value={qrData.url}
                  className="min-w-0 flex-1 truncate bg-transparent text-xs font-mono text-muted-foreground outline-none"
                />
                <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 text-xs">
                  {copied ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.open(qrData.url, '_blank')} className="h-7 px-2" title="Preview ordering page">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-2 w-full space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
              <span className="block text-xs font-bold text-foreground">
                {isDelivery ? 'Send Delivery Menu via WhatsApp' : 'Send Menu Link via WhatsApp'}
              </span>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Shop / Restaurant Name</label>
                <input
                  type="text"
                  placeholder="e.g. Al Safadi Restaurant"
                  value={shopNameInput}
                  onChange={e => setShopNameInput(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  placeholder="e.g. 050 123 4567 or 9876543210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button
                  onClick={handleSendWhatsApp}
                  disabled={!phone.trim() || sending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {sending ? 'Sending...' : 'Send WhatsApp'}
                </Button>
              </div>
              {statusMessage && <p className="text-xs font-semibold text-emerald-600">{statusMessage}</p>}
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">Failed to generate QR code.</p>
        )}
      </div>
    </Modal>
  );
}
