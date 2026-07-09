import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { Loader2, Save, Settings2, Percent, Coins, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function LoyaltySettings() {
  const [enabled, setEnabled] = useState(false);
  const [earningRate, setEarningRate] = useState('100');
  const [redemptionRate, setRedemptionRate] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchApi('/api/settings?key=loyalty_config');
        if (data?.value) {
          const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setEnabled(cfg.loyaltyEnabled ?? false);
          setEarningRate(String(cfg.loyaltyEarningRate ?? '100'));
          setRedemptionRate(String(cfg.loyaltyRedemptionRate ?? '1'));
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const value = JSON.stringify({
        loyaltyEnabled: enabled,
        loyaltyEarningRate: parseFloat(earningRate) || 100,
        loyaltyRedemptionRate: parseFloat(redemptionRate) || 1,
      });
      await fetchApi('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'loyalty_config', value }),
      });
      showStatus('Settings saved', 'success');
    } catch (e: any) {
      showStatus(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Settings2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-sm font-bold text-foreground truncate">Loyalty Settings</h1>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">Configure point earning & redemption</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-lg mx-auto w-full space-y-4">
        {status && (
          <div className={clsx(
            "px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2",
            status.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600" : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {status.text}
          </div>
        )}

        <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Settings2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-primary uppercase tracking-wider">Status</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground font-semibold">Enable loyalty points</p>
              <p className="text-xs text-muted-foreground/60">Customers earn points on purchases that can be redeemed for discounts</p>
            </div>
            <button type="button" onClick={() => setEnabled(!enabled)}
              className={clsx(
                'relative w-12 h-7 rounded-full transition-colors duration-200',
                enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              )}>
              <span className={clsx(
                'absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200',
                enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        </section>

        {enabled && (
          <>
            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <Coins className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-amber-500 uppercase tracking-wider">Earning Rate</span>
              </div>
              <div>
                <label className="block text-sm font-bold text-muted-foreground mb-1.5">Spend amount to earn 1 point (in ₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                  <input type="number" min="1" step="1"
                    value={earningRate}
                    onChange={e => setEarningRate(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                </div>
                <p className="text-xs text-muted-foreground font-semibold mt-2">
                  Example: ₹100 = 1 point
                </p>
              </div>
            </section>

            <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">Redemption Rate</span>
              </div>
              <div>
                <label className="block text-sm font-bold text-muted-foreground mb-1.5">Discount value per point (in ₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">₹</span>
                  <input type="number" step="0.1" min="0.1"
                    value={redemptionRate}
                    onChange={e => setRedemptionRate(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm" />
                </div>
                <p className="text-xs text-muted-foreground font-semibold mt-2">
                  e.g. 1 point = ₹1 discount
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}