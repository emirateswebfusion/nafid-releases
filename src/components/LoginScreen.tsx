import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Store, ArrowRight, Loader2, Eye, EyeOff, ShoppingBag, Gem, Wrench } from 'lucide-react';
import clsx from 'clsx';

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
    <div className="min-h-screen w-screen bg-neutral-950 flex select-none">

      {/* ── Left Branding Panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 relative overflow-hidden">
        {/* Animated gradient bg */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-neutral-900 to-emerald-900/30" />
        <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl">
              <ShoppingBag className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight">Vendora</span>
          </div>
          <p className="text-neutral-400 text-sm ml-1">Retail POS Platform</p>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-black text-white leading-tight">
            Your complete<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              retail command center.
            </span>
          </h1>
          <p className="text-neutral-400 leading-relaxed">
            Offline-first billing, hardware integration, GST compliance, and real-time cloud sync — all in one place.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { icon: ShoppingBag, label: 'General Retail', color: 'text-blue-400' },
              { icon: Wrench, label: 'Hardware Stores', color: 'text-orange-400' },
              { icon: Gem, label: 'Jewelry Shops', color: 'text-yellow-400' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 bg-neutral-800/40 rounded-xl border border-neutral-700/40">
                <Icon className={clsx('w-6 h-6', color)} />
                <span className="text-xs text-neutral-400 text-center">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-neutral-600 text-xs">© {new Date().getFullYear()} Vendora POS. All rights reserved.</p>
      </div>

      {/* ── Right Auth Panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Tab toggle */}
          {tab !== 'forgot-password' && tab !== 'reset-password' && (
            <div className="flex bg-neutral-900 border border-neutral-800 p-1 rounded-xl mb-8">
              {(['login', 'register'] as Tab[]).filter(t => t === 'login' || t === 'register').map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(''); setSuccessMsg(''); }}
                  className={clsx(
                    'flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all duration-300',
                    tab === t ? 'bg-white text-neutral-900 shadow' : 'text-neutral-500 hover:text-neutral-300'
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
                <h2 className="text-2xl font-bold text-white">Welcome back</h2>
                <p className="text-neutral-500 text-sm mt-1">Sign in to your Vendora account</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="owner@yourshop.com"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setTab('forgot-password'); setError(''); setSuccessMsg(''); }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Forgot Password?
                </button>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl text-center">
                  {successMsg}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-neutral-900 rounded-xl font-bold hover:bg-neutral-100 transition-all active:scale-[0.98] disabled:opacity-60 shadow-lg"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* ── REGISTER FORM ───────────────────────────────────────────── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white">Create your shop</h2>
                <p className="text-neutral-500 text-sm mt-1">Set up your Vendora account in seconds</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Shop Name</label>
                    <div className="relative">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type="text" value={reg.shop_name} onChange={e => setReg(r => ({ ...r, shop_name: e.target.value }))}
                        placeholder="My Awesome Store"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 pl-11 text-white placeholder-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Business Type</label>
                    <div className="grid grid-cols-4 gap-2">
                      {DOMAIN_OPTIONS.map(d => (
                        <button
                          key={d} type="button"
                          onClick={() => setReg(r => ({ ...r, domain_type: d }))}
                          className={clsx(
                            'py-2 px-1 rounded-lg text-xs font-semibold border transition-all',
                            reg.domain_type === d
                              ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                              : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Your Name</label>
                    <input
                      type="text" value={reg.owner_name} onChange={e => setReg(r => ({ ...r, owner_name: e.target.value }))}
                      placeholder="Full Name"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Email</label>
                    <input
                      type="email" value={reg.owner_email} onChange={e => setReg(r => ({ ...r, owner_email: e.target.value }))}
                      placeholder="you@shop.com"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={reg.owner_password} onChange={e => setReg(r => ({ ...r, owner_password: e.target.value }))}
                        placeholder="Choose a strong password"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none transition-all"
                      />
                      <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-xl font-bold hover:from-blue-500 hover:to-emerald-500 transition-all active:scale-[0.98] disabled:opacity-60 shadow-[0_10px_30px_rgba(5,150,105,0.25)]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? 'Creating Account...' : 'Create Account & Start'}
              </button>
            </form>
          )}

          {/* ── FORGOT PASSWORD FORM ─────────────────────────────────────── */}
          {tab === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div>
                <button 
                  type="button" 
                  onClick={() => { setTab('login'); setError(''); setSuccessMsg(''); }}
                  className="text-xs text-neutral-500 hover:text-neutral-300 mb-4 transition-colors flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3 rotate-180" /> Back to Login
                </button>
                <h2 className="text-2xl font-bold text-white">Forgot Password</h2>
                <p className="text-neutral-500 text-sm mt-1">Enter your email to receive a reset link</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="owner@yourshop.com"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl text-center">
                  {successMsg}
                </div>
              )}

              {!successMsg && (
                <button
                  type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-neutral-900 rounded-xl font-bold hover:bg-neutral-100 transition-all active:scale-[0.98] disabled:opacity-60 shadow-lg"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                  {loading ? 'Sending link...' : 'Send Reset Link'}
                </button>
              )}
            </form>
          )}

          {/* ── RESET PASSWORD FORM ──────────────────────────────────────── */}
          {tab === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-white">Reset Password</h2>
                <p className="text-neutral-500 text-sm mt-1">Enter your new password</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-neutral-900 rounded-xl font-bold hover:bg-neutral-100 transition-all active:scale-[0.98] disabled:opacity-60 shadow-lg"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          <p className="text-center text-neutral-600 text-xs mt-8">
            Connect your Cloud API server before signing in.
            <br />Default: <span className="font-mono text-neutral-500">http://localhost:3001</span>
          </p>
        </div>
      </div>
    </div>
  );
}
