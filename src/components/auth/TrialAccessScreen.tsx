import { Clock3 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';

export function TrialAccessScreen({ error, retry }: { error?: string; retry: () => void }) {
  const logout = useAuthStore(state => state.logout);
  return <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
    <div className="max-w-md w-full space-y-5 rounded-2xl border border-border p-8">
      <Clock3 className="h-8 w-8 text-primary" /><h1 className="text-2xl font-bold">Check your trial access</h1>
      <p role="alert" className="text-sm text-muted-foreground">{error || 'Connect to the internet and sign in to continue your trial.'}</p>
      <p className="text-xs text-muted-foreground">Your shop data is kept. Contact Nafid if you need more trial time or want to activate your account.</p>
      <Button className="w-full" onClick={retry}>Check again</Button>
      <Button className="w-full" variant="outline" onClick={() => void logout()}>Sign in again</Button>
    </div>
  </main>;
}
