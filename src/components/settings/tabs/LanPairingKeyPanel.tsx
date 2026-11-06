import { useSettingsSectionSave } from '../hooks/useSettingsSectionSave';
import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';

/** Same alphabet and format as electron/services/lanPairing.ts (no ambiguous characters). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('').match(/.{4}/g)!.join('-');
}

function formatKey(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (clean.match(/.{1,4}/g) || []).join('-');
}

interface Props {
  lanRole: 'PRIMARY' | 'SECONDARY';
  setMessage: (msg: { type: 'success' | 'error'; text: string }) => void;
}

/**
 * Shop pairing key for LAN sync. The primary terminal shows (and can regenerate) the key; secondary terminals
 * enter it. The key is stored in the device-local `network_sync_config` setting and sent with every LAN request.
 */
export function LanPairingKeyPanel({ lanRole, setMessage }: Props) {
  const tenantId = useAuthStore((s) => s.tenantId) || 'global';
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    getSetting<Record<string, unknown>>({ tenant_id: tenantId, key: 'network_sync_config' })
      .then((config) => { const value = typeof config?.lanPairingKey === 'string' ? formatKey(config.lanPairingKey) : ''; setKey(value); setSaved(value); })
      .catch(() => setKey(''));
  }, [tenantId, lanRole]);

  useSettingsSectionSave(key !== saved, async () => {
    if (key.replace(/-/g, '').length !== 16) throw new Error('Enter a complete 16-character shop pairing key.');
    const current = await getSetting<Record<string, unknown>>({ tenant_id: tenantId, key: 'network_sync_config' }) || {};
    await setSetting({ tenant_id: tenantId, key: 'network_sync_config', value: { ...current, lanPairingKey: key } });
    setSaved(key);
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage({ type: 'error', text: 'Copy failed — select the key and copy it manually.' });
    }
  };

  return (
    <div className="p-3 border border-border rounded-xl space-y-2" data-testid="lan-pairing-key">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Shop pairing key</span>
      </div>
      {lanRole === 'PRIMARY' ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2.5 bg-background border border-border rounded-xl font-mono text-sm font-bold tracking-widest text-primary">
              {key || 'Generated when the LAN server starts'}
            </code>
            <Button variant="outline" size="icon" onClick={copy} disabled={!key} aria-label="Copy pairing key">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"

              onClick={() => setKey(newKey())}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Secondary terminals must enter this key. Regenerating it disconnects every terminal until the new key is entered.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              value={key}
              onChange={(e) => setKey(formatKey(e.target.value))}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="font-mono text-xs font-semibold tracking-widest"
              aria-label="Shop pairing key"
            />

          </div>
          <p className="text-[11px] text-muted-foreground">Enter the key shown on the primary terminal (Settings → Network).</p>
        </>
      )}
    </div>
  );
}
