import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Store, ArrowRight, Loader2, Eye, EyeOff, ShoppingBag, Gem, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type Tab = 'login' | 'register' | 'forgot-password' | 'reset-password';
const DOMAIN_OPTIONS = ['GENERAL', 'HARDWARE', 'JEWELRY', 'GROCERY'];

export function LoginScreen() {
  const { login, register } = useAuthStore();

  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [reg, setReg] = useState({
    shop_name: '',
    domain_type: 'GENERAL',
    owner_email: '',
    owner_password: '',
    owner_name: '',
  });

  const [resetToken, setResetToken] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required.'); return; }
    setError('');
    setLoading(true);
    const res = await login(email, password);
    if (!res.success) setError(res.error || 'Login failed.');
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reg.shop_name || !reg.owner_email || !reg.owner_password) {
      setError('Shop name, email, and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    const res = await register(reg);
    if (!res.success) setError(res.error || 'Registration failed.');
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email is required.'); return; }
    setError('');
    setLoading(true);
    const res = await useAuthStore.getState().forgotPassword(email);
    if (res.success) {
      setSuccessMsg('A reset link has been sent to your email.');
      setError('');
    } else {
      setError(res.error || 'Failed to send reset link.');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('New password is required.'); return; }
    setError('');
    setLoading(true);
    const res = await useAuthStore.getState().resetPassword(resetToken, password);
    if (res.success) {
      setSuccessMsg('Password reset successful. You can now sign in.');
      setTab('login');
      setError('');
    } else {
      setError(res.error || 'Failed to reset password.');
    }
    setLoading(false);
  };

  // Check for reset token in URL on mount (for web version if applicable)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setResetToken(token);
      setTab('reset-password');
    }

    // Handle deep link from Electron
    if (window.electronAPI?.onDeepLink) {
      window.electronAPI.onDeepLink((token: string) => {
        setResetToken(token);
        setTab('reset-password');
      });
    }
  }, []);

  return (
    <div className="min-h-screen w-screen bg-background flex select-none">

      {/* ── Left Branding Panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden bg-muted border-r border-border">
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <img src="./logo.png" alt="Vendora Logo" className="w-12 h-12 object-contain" />
            <span className="text-3xl font-black text-foreground tracking-tight">Vendora</span>
          </div>
          <p className="text-muted-foreground text-sm ml-1">Retail POS Platform</p>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-black text-foreground leading-tight">
            Your complete<br />
            <span className="text-primary">
              retail command center.
            </span>
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Offline-first billing, hardware integration, GST compliance, and real-time cloud sync — all in one place.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { icon: ShoppingBag, label: 'General Retail' },
              { icon: Wrench, label: 'Hardware Stores' },
              { icon: Gem, label: 'Jewelry Shops' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 bg-background rounded-xl border border-border shadow-sm">
                <Icon className="w-6 h-6 text-primary" />
                <span className="text-xs text-muted-foreground text-center font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-muted-foreground text-xs">© {new Date().getFullYear()} Vendora POS. All rights reserved.</p>
      </div>

      {/* ── Right Auth Panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">

          {/* Tab toggle */}
          {tab !== 'forgot-password' && tab !== 'reset-password' && (
            <div className="flex bg-muted p-1 rounded-xl mb-8 border border-border">
              {(['login', 'register'] as Tab[]).filter(t => t === 'login' || t === 'register').map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(''); setSuccessMsg(''); }}
                  className={clsx(
                    'flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all duration-300',
                    tab === t ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          {/* ── LOGIN FORM ──────────────────────────────────────────────── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1">Sign in to your Vendora account</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <Input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="owner@yourshop.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-12"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setTab('forgot-password'); setError(''); setSuccessMsg(''); }}
                  className="text-xs text-primary hover:underline transition-colors font-medium"
                >
                  Forgot Password?
                </button>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="bg-primary/10 border border-primary/30 text-primary text-sm px-4 py-3 rounded-xl text-center">
                  {successMsg}
                </div>
              )}

              <Button
                type="submit" disabled={loading}
                className="w-full py-6 text-base font-bold shadow-sm"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          )}

          {/* ── REGISTER FORM ───────────────────────────────────────────── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Create your shop</h2>
                <p className="text-muted-foreground text-sm mt-1">Set up your Vendora account in seconds</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1.5">Shop Name</label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text" value={reg.shop_name} onChange={e => setReg(r => ({ ...r, shop_name: e.target.value }))}
                        placeholder="My Awesome Store"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1.5">Business Type</label>
                    <div className="grid grid-cols-4 gap-2">
                      {DOMAIN_OPTIONS.map(d => (
                        <button
                          key={d} type="button"
                          onClick={() => setReg(r => ({ ...r, domain_type: d }))}
                          className={clsx(
                            'py-2 px-1 rounded-lg text-xs font-semibold border transition-all',
                            reg.domain_type === d
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Your Name</label>
                    <Input
                      type="text" value={reg.owner_name} onChange={e => setReg(r => ({ ...r, owner_name: e.target.value }))}
                      placeholder="Full Name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <Input
                      type="email" value={reg.owner_email} onChange={e => setReg(r => ({ ...r, owner_email: e.target.value }))}
                      placeholder="you@shop.com"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'} value={reg.owner_password} onChange={e => setReg(r => ({ ...r, owner_password: e.target.value }))}
                        placeholder="Choose a strong password"
                        className="pr-12"
                      />
                      <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <Button
                type="submit" disabled={loading}
                className="w-full py-6 text-base font-bold shadow-sm"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                {loading ? 'Creating Account...' : 'Create Account & Start'}
              </Button>
            </form>
          )}

          {/* ── FORGOT PASSWORD FORM ─────────────────────────────────────── */}
          {tab === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <button
                  type="button"
                  onClick={() => { setTab('login'); setError(''); setSuccessMsg(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3 rotate-180" /> Back to Login
                </button>
                <h2 className="text-2xl font-bold text-foreground">Forgot Password</h2>
                <p className="text-muted-foreground text-sm mt-1">Enter your email to receive a reset link</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <Input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="owner@yourshop.com"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="bg-primary/10 border border-primary/30 text-primary text-sm px-4 py-3 rounded-xl text-center">
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <Button
                  type="submit" disabled={loading}
                  className="w-full py-6 text-base font-bold shadow-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                  {loading ? 'Sending link...' : 'Send Reset Link'}
                </Button>
              )}
            </form>
          )}

          {/* ── RESET PASSWORD FORM ──────────────────────────────────────── */}
          {tab === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Reset Password</h2>
                <p className="text-muted-foreground text-sm mt-1">Enter your new password</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">New Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-12"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <Button
                type="submit" disabled={loading}
                className="w-full py-6 text-base font-bold shadow-sm"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}


        </div>
      </div>
    </div>
  );
}
