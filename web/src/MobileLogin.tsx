import { useState } from 'react';
import { useAuthStore } from '../../src/store/authStore';
import { Store, Loader2, Lock } from 'lucide-react';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';

export function MobileLogin() {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required.'); return; }
    setError('');
    setLoading(true);
    const res = await login(email, password);
    if (!res.success) {
      setError(res.error || 'Login failed.');
    } else {
      if (useAuthStore.getState().role !== 'OWNER') {
        setError('Only shop owners can access this dashboard.');
        useAuthStore.getState().logout();
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 shadow-2xl rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-foreground">Vendora Web</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">Owner Dashboard</p>
        </div>

        {error && (
          <div className="p-3 mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl text-center border border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@shop.com"
              className="h-12 rounded-xl"
              autoComplete="email"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 rounded-xl"
              autoComplete="current-password"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl text-md font-bold mt-2" 
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4" /> Secure Login
              </span>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
