import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Store, ArrowRight, Loader2, Eye, EyeOff, ShoppingBag, Gem, Wrench, Building2, Mail, Lock, User, StoreIcon, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type Tab = 'login' | 'register' | 'forgot-password' | 'reset-password';

const DOMAIN_OPTIONS = [
  { value: 'GENERAL', label: 'General', icon: ShoppingBag },
  { value: 'HARDWARE', label: 'Hardware', icon: Wrench },
  { value: 'JEWELRY', label: 'Jewelry', icon: Gem },
  { value: 'GROCERY', label: 'Grocery', icon: Building2 },
] as const;

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

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearMessages = () => {
    setError('');
    setSuccessMsg('');
    setFieldErrors({});
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Please enter your email address';
    if (!password) errors.password = 'Please enter your password';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setLoading(true);
    const res = await login(email, password);
    if (!res.success) setError(res.error || 'Login failed.');
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const errors: Record<string, string> = {};
    if (!reg.shop_name.trim()) errors.shop_name = 'What\'s your shop called?';
    if (!reg.owner_name.trim()) errors.owner_name = 'We\'d love to know your name';
    if (!reg.owner_email.trim()) errors.owner_email = 'Please enter your email address';
    if (!reg.owner_password) errors.owner_password = 'Please create a password';
    else if (reg.owner_password.length < 6) errors.owner_password = 'Make it at least 6 characters for security';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setLoading(true);
    const res = await register(reg);
    if (!res.success) setError(res.error || 'Registration failed.');
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
      setError(res.error || 'Failed to send reset link.');
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
      setError(res.error || 'Failed to reset password.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setResetToken(token);
      setTab('reset-password');
    }
    if (window.electronAPI?.onDeepLink) {
      window.electronAPI.onDeepLink((token: string) => {
        setResetToken(token);
        setTab('reset-password');
      });
    }
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    clearMessages();
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen w-screen bg-background flex select-none overflow-hidden">

      {/* ── Left Branding Panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 border-r border-border">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <StoreIcon className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-3xl font-black text-foreground tracking-tight">Vendora</span>
          </div>
            <p className="text-muted-foreground text-sm ml-1">The Smarter Way to Sell</p>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-black text-foreground leading-[1.15]">
            Your entire retail operation.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              In one powerful platform.
            </span>
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-sm">
            Offline-first billing, hardware integration, GST compliance, and real-time cloud sync. No internet? No problem. No experience? You've got this.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: ShoppingBag, label: 'General Retail' },
              { icon: Wrench, label: 'Hardware Stores' },
              { icon: Gem, label: 'Jewelry Shops' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 bg-background/80 backdrop-blur-sm rounded-xl border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-[11px] text-muted-foreground text-center font-medium leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-muted-foreground text-xs">&copy; {new Date().getFullYear()} Vendora POS. All rights reserved.</p>
      </div>

      {/* ── Right Auth Panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">

          {/* Tab Switcher */}
          {tab !== 'forgot-password' && tab !== 'reset-password' && (
            <div className="flex gap-1 mb-8 p-1 bg-muted rounded-lg border border-border">
              <button
                onClick={() => switchTab('login')}
                className={clsx(
                  'flex-1 py-2.5 rounded-md text-sm font-semibold transition-all duration-200',
                  tab === 'login'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Sign In
              </button>
              <button
                onClick={() => switchTab('register')}
                className={clsx(
                  'flex-1 py-2.5 rounded-md text-sm font-semibold transition-all duration-200',
                  tab === 'register'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Get Started
              </button>
            </div>
          )}

          {/* ── LOGIN ────────────────────────────────────────────────────── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1">Sign in to pick up where you left off</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="login-email">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourshop.com"
                      className={clsx("pl-9", fieldErrors.email && "border-destructive ring-1 ring-destructive")}
                    />
                  </div>
                  {fieldErrors.email && <p className="text-destructive text-xs mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Your password"
                      className={clsx("pl-9 pr-10", fieldErrors.password && "border-destructive ring-1 ring-destructive")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      tabIndex={-1}
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
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3 rounded-lg text-center">
                  {successMsg}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold shadow-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {loading ? 'Signing you in...' : 'Sign In to Vendora'}
              </Button>
            </form>
          )}

          {/* ── REGISTER ─────────────────────────────────────────────────── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Start your journey</h2>
                <p className="text-muted-foreground text-sm mt-1">Join thousands of retailers already using Vendora</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-shop">Shop Name</label>
                  <div className="relative">
                    <StoreIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="reg-shop"
                      type="text"
                      value={reg.shop_name}
                      onChange={e => setReg(r => ({ ...r, shop_name: e.target.value }))}
                      placeholder="e.g. My Corner Shop"
                      className={clsx("pl-9", fieldErrors.shop_name && "border-destructive ring-1 ring-destructive")}
                    />
                  </div>
                  {fieldErrors.shop_name && <p className="text-destructive text-xs mt-1">{fieldErrors.shop_name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">What do you sell?</label>
                  <div className="grid grid-cols-4 gap-2">
                    {DOMAIN_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReg(r => ({ ...r, domain_type: value }))}
                        className={clsx(
                          'flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg text-xs font-semibold border transition-all',
                          reg.domain_type === value
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                        )}
                      >
                        <Icon className={clsx(
                          'w-4 h-4',
                          reg.domain_type === value ? 'text-primary' : 'text-muted-foreground'
                        )} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-name">Your Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="reg-name"
                        type="text"
                        value={reg.owner_name}
                        onChange={e => setReg(r => ({ ...r, owner_name: e.target.value }))}
                        placeholder="Your full name"
                        className={clsx("pl-9", fieldErrors.owner_name && "border-destructive ring-1 ring-destructive")}
                      />
                    </div>
                    {fieldErrors.owner_name && <p className="text-destructive text-xs mt-1">{fieldErrors.owner_name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-email">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="reg-email"
                        type="email"
                        value={reg.owner_email}
                        onChange={e => setReg(r => ({ ...r, owner_email: e.target.value }))}
                        placeholder="you@shop.com"
                        className={clsx("pl-9", fieldErrors.owner_email && "border-destructive ring-1 ring-destructive")}
                      />
                    </div>
                    {fieldErrors.owner_email && <p className="text-destructive text-xs mt-1">{fieldErrors.owner_email}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-password">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      value={reg.owner_password}
                      onChange={e => setReg(r => ({ ...r, owner_password: e.target.value }))}
                      placeholder="Create a strong password"
                      className={clsx("pl-9 pr-10", fieldErrors.owner_password && "border-destructive ring-1 ring-destructive")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.owner_password && <p className="text-destructive text-xs mt-1">{fieldErrors.owner_password}</p>}
                  {reg.owner_password && (
                    <div className="flex gap-1 mt-1.5">
                      {['weak', 'medium', 'strong'].map((level, i) => {
                        const strength = Math.min(reg.owner_password.length / 4, 3);
                        const active = i < strength;
                        return (
                          <div
                            key={level}
                            className={clsx(
                              'h-1 flex-1 rounded-full transition-colors duration-300',
                              active
                                ? i === 0 ? 'bg-destructive'
                                : i === 1 ? 'bg-amber-500'
                                : 'bg-emerald-500'
                                : 'bg-muted'
                            )}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold shadow-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {loading ? 'Creating your account...' : 'Create Your Account'}
              </Button>
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
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@yourshop.com"
                    className={clsx("pl-9", fieldErrors.email && "border-destructive ring-1 ring-destructive")}
                  />
                </div>
                {fieldErrors.email && <p className="text-destructive text-xs mt-1">{fieldErrors.email}</p>}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {error}
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
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your new password"
                    className={clsx("pl-9 pr-10", fieldErrors.password && "border-destructive ring-1 ring-destructive")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-destructive text-xs mt-1">{fieldErrors.password}</p>}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-destructive" />
                  {error}
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
