import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Loader2, Eye, EyeOff, Mail, Lock, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { hasBridge } from '../../data/client';
import { bridgeEvents } from '../../data/events';
import { AuthBrandPanel } from './AuthBrandPanel';
import { TrialRegistration } from './TrialRegistration';
import { QuickPinLogin } from './QuickPinLogin';
import { authApi } from '../../data/auth';

type Tab = 'pin' | 'login' | 'register' | 'forgot-password' | 'reset-password';

export function LoginScreen() {
  const login = useAuthStore(state => state.login);

  const [tab, setTab] = useState<Tab>('login');
  const [shopName, setShopName] = useState('');
  const [lastUser, setLastUser] = useState({ name: '', role: '' });
  const [terminalConfigured, setTerminalConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);
  const resetPasswordRef = useRef<HTMLInputElement>(null);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [resetToken, setResetToken] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearMessages = () => {
    setError('');
    setSuccessMsg('');
    setFieldErrors({});
  };

  const handleLogin = async (e: React.SyntheticEvent, offlineOnly = false) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Please enter your email address';
    if (!password) errors.password = 'Please enter your password';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setLoading(true);
    const res = await login(email.trim(), password, undefined, offlineOnly ? { offlineOnly: true } : undefined);
    if (res.success) { try { sessionStorage.removeItem('auth_prefer_email'); } catch { /* ignore */ } }
    if (!res.success) setError(typeof res.error === 'string' ? res.error : ((res.error as unknown as { message?: string })?.message || 'Login failed.'));
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!email.trim()) { setFieldErrors({ email: 'Please enter your email address' }); return; }
    setLoading(true);
    const res = await useAuthStore.getState().forgotPassword(email);
    if (res.success) {
      setSuccessMsg("If that email is registered, you'll receive a reset link shortly.");
    } else {
      setError(typeof res.error === 'string' ? res.error : ((res.error as unknown as { message?: string })?.message || 'Failed to send reset link.'));
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!password) { setFieldErrors({ password: 'Please enter a new password' }); return; }
    if (password.length < 6) { setFieldErrors({ password: 'Make it at least 6 characters for security' }); return; }
    setLoading(true);
    const res = await useAuthStore.getState().resetPassword(resetToken, password);
    if (res.success) {
      setSuccessMsg('All set! Your password has been updated. Redirecting you to sign in...');
      setTimeout(() => { setTab('login'); clearMessages(); }, 1500);
    } else {
      setError(typeof res.error === 'string' ? res.error : ((res.error as unknown as { message?: string })?.message || 'Failed to reset password.'));
    }
    setLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location.search seeds reset-password state from a deep link after mount.
      setResetToken(token);
      setTab('reset-password');
    }
    if (hasBridge('onDeepLink')) {
      return bridgeEvents.onDeepLink((token: string) => {
        setResetToken(token);
        setTab('reset-password');
      });
    }
  }, []);

  useEffect(() => {
    if (hasBridge('authGetTerminalConfig')) {
      authApi.getTerminalConfig().then((cfg) => {
        if (cfg?.isConfigured) {
          setTerminalConfigured(true);
          if (cfg.shop_name) setShopName(cfg.shop_name);
          setLastUser({ name: cfg.user_name || '', role: cfg.role || '' });
          setTab('pin');
        }
      }).catch(() => {});
    }
  }, []);

  const switchTab = (t: Tab) => {
    if (t === 'pin') { try { sessionStorage.removeItem('auth_prefer_email'); } catch { /* ignore */ } }
    setTab(t);
    clearMessages();
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex">

      <AuthBrandPanel />

      {/* ── Right Auth Panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-background min-w-0">
        <div className={clsx('w-full', tab === 'register' ? 'max-w-lg' : 'max-w-sm')}>
          <div className="flex lg:hidden items-center gap-2 mb-8"><img src="./logo.png" alt="" className="h-8 w-8 object-contain" /><span className="text-xl font-black">NAFID</span></div>
          {tab === 'pin' && (
            <QuickPinLogin
              shopName={shopName} userName={lastUser.name} role={lastUser.role}
              onSwitchToEmail={() => switchTab('login')}
            />
          )}

          {tab === 'register' && <TrialRegistration onSignIn={() => switchTab('login')} />}
          {/* ── LOGIN ────────────────────────────────────────────────────── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              {terminalConfigured && (
                <button
                  type="button"
                  onClick={() => switchTab('pin')}
                  className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1 font-semibold group cursor-pointer mb-2"
                >
                  <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  Back to Quick PIN Sign In
                </button>
              )}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1">Sign in to manage your shop with Nafid.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="login-email">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={emailRef}
                      autoComplete="username"
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourshop.com"
                      className={clsx("pl-9", fieldErrors.email && "border-destructive ring-1 ring-destructive")}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
                    />
                  </div>
                  {fieldErrors.email && <p className="text-destructive text-xs mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={passwordRef}
                      autoComplete="current-password"
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      className={clsx("pl-9 pr-10", fieldErrors.password && "border-destructive ring-1 ring-destructive")}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const form = (e.target as HTMLInputElement).form; form?.requestSubmit(); } }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-destructive text-xs mt-1">{fieldErrors.password}</p>}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchTab('forgot-password')}
                  className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  Forgot your password?
                </button>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {typeof error === 'string' ? error : ((error as { message?: string })?.message || JSON.stringify(error))}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3 rounded-lg text-center">
                  {successMsg}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold shadow-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {loading ? 'Signing you in...' : 'Sign in'}
              </Button>
              {error && terminalConfigured && hasBridge('authLoginOffline') && (
                <div className="space-y-2">
                  <Button type="button" variant="outline" disabled={loading} className="w-full h-11"
                    onClick={event => { void handleLogin(event, true); }}>
                    Continue offline with this password
                  </Button>
                  <p className="text-xs text-muted-foreground">Checks the saved password on this PC. Billing stays available; cloud sync needs a valid cloud connection.</p>
                </div>
              )}
              <div className="border-t border-border pt-5 text-center space-y-2">
                <p className="text-sm text-muted-foreground">New to Nafid?</p>
                <Button type="button" variant="outline" className="w-full h-11" onClick={() => switchTab('register')}>Sign up for a free trial</Button>
                <p className="text-xs text-muted-foreground">Preview registration · Trial access coming soon</p>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD ──────────────────────────────────────────── */}
          {tab === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors flex items-center gap-1 group"
                >
                  <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  Back to sign in
                </button>
                <h2 className="text-2xl font-bold text-foreground">Forgot your password?</h2>
                <p className="text-muted-foreground text-sm mt-1">No worries. We'll send you a reset link.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="forgot-email">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={forgotEmailRef}
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@yourshop.com"
                    className={clsx("pl-9", fieldErrors.email && "border-destructive ring-1 ring-destructive")}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const form = (e.target as HTMLInputElement).form; form?.requestSubmit(); } }}
                  />
                </div>
                {fieldErrors.email && <p className="text-destructive text-xs mt-1">{fieldErrors.email}</p>}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {typeof error === 'string' ? error : ((error as { message?: string })?.message || JSON.stringify(error))}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3 rounded-lg text-center flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold shadow-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loading ? 'Sending link...' : 'Send Reset Link'}
                </Button>
              )}
            </form>
          )}

          {/* ── RESET PASSWORD ───────────────────────────────────────────── */}
          {tab === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors flex items-center gap-1 group"
                >
                  <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  Back to sign in
                </button>
                <h2 className="text-2xl font-bold text-foreground">Set a new password</h2>
                <p className="text-muted-foreground text-sm mt-1">Make it something you'll remember</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reset-password">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={resetPasswordRef}
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your new password"
                    className={clsx("pl-9 pr-10", fieldErrors.password && "border-destructive ring-1 ring-destructive")}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const form = (e.target as HTMLInputElement).form; form?.requestSubmit(); } }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-destructive text-xs mt-1">{fieldErrors.password}</p>}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {typeof error === 'string' ? error : ((error as { message?: string })?.message || JSON.stringify(error))}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3 rounded-lg text-center">
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold shadow-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

