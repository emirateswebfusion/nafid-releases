import { useState } from 'react';
import { Button } from '../../ui/Button';
import { sendPurchaseWhatsApp } from '../../../data/purchaseWhatsApp';
import type { PurchaseBill } from '../purchaseTypes';

export function PurchaseWhatsAppButton({ bill }: { bill: PurchaseBill }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function send() {
    setBusy(true); setStatus('');
    try {
      const result = await sendPurchaseWhatsApp(bill);
      setStatus(result.success ? 'Purchase message sent' : result.error || 'Could not send purchase message');
    } catch (err) { setStatus(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return <div className="max-w-xs">
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void send()}>{busy ? 'Sending...' : 'WhatsApp'}</Button>
    {status && <p role="status" className="text-xs">{status}</p>}
  </div>;
}
