import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CloudOff, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAuthStore } from '../../store/authStore';
import { resumeCloudSync } from '../../store/cloudSyncRecovery';

interface SessionExpiredModalProps { isOpen: boolean; onClose: () => void }

export function SessionExpiredModal({ isOpen, onClose }: SessionExpiredModalProps) {
  return isOpen ? <CloudSyncSignIn onClose={onClose} /> : null;
}

function CloudSyncSignIn({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  const close = () => { request.current?.abort(); onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (request.current) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    const controller = new AbortController();
    request.current = controller; setLoading(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await resumeCloudSync(email, password, useAuthStore, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.success) { setPassword(''); onClose(); }
      else setError(result.error || 'Cloud sign-in failed. You can continue offline.');
    } finally {
      clearTimeout(timeout); request.current = null;
      if (mounted.current) {
        setLoading(false);
        if (controller.signal.aborted) setError('Cloud sign-in timed out. Retry or close this dialog to continue offline.');
      }
    }
  };
  return (
    <Modal isOpen onClose={close} title="Reconnect cloud sync" className="max-w-md" overlayClassName="z-[9999]">
      <form onSubmit={submit} className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CloudOff className="w-5 h-5 shrink-0" />
          Billing stays available offline. Sign in with an account for this shop to reconnect cloud sync. Your current user and open bills stay in place.
        </p>
        <div className="space-y-1">
          <label htmlFor="cloud-sync-email" className="text-sm font-medium">Email</label>
          <Input id="cloud-sync-email" type="email" autoComplete="username" value={email} disabled={loading} onChange={event => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="cloud-sync-password" className="text-sm font-medium">Password</label>
          <Input id="cloud-sync-password" type="password" autoComplete="current-password" value={password} disabled={loading} onChange={event => setPassword(event.target.value)} required />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {loading ? 'Connecting...' : 'Sign in to reconnect'}
        </Button>
        <Button type="button" variant="outline" onClick={close} className="w-full">Continue working offline</Button>
      </form>
    </Modal>
  );
}