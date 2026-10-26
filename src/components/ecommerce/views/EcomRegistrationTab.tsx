import React from 'react';
import { Store, CheckCircle2, AlertCircle, RefreshCw, Eye, ShieldCheck, MapPin } from 'lucide-react';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomRegistrationTabProps {
  currentTenantId: string;
  handleRegister: (e: React.FormEvent) => Promise<void>;
  regForm: { store_name: string; store_slug: string; store_description: string; contact_name: string; contact_email: string; contact_phone: string; city: string; address: string; pincode: string; };
  setRegForm: React.Dispatch<React.SetStateAction<{ store_name: string; store_slug: string; store_description: string; contact_name: string; contact_email: string; contact_phone: string; city: string; address: string; pincode: string; }>>;
  shopName: string | null;
  summary: { published: number; pending: number; revenue: number; inStockCount: number; totalCatalog: number; publishedPercent: number; };
  ec: EcommerceState;
}

/** Vendor registration tab: business / contact details and submission status. */
export function EcomRegistrationTab({
  currentTenantId, handleRegister, regForm, setRegForm, shopName, summary, ec,
}: EcomRegistrationTabProps) {
  const { regError, regLoading, regSuccess, settings } = ec;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 animate-in fade-in duration-200">
      
      {/* Left Column (7 cols): The Registration Form */}
      <div className="lg:col-span-7 rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-4.5 w-4.5 text-primary" />
            <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">FusionCart Vendor Registration</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Register this local POS store onto the connected FusionCart marketplace cluster to unlock public storefront selling.
          </p>
        </div>

        {regSuccess && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Registration submitted successfully! Application status: <strong>{settings?.registration_status}</strong></span>
          </div>
        )}

        {regError && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{regError}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          
          {/* Section 1: Storefront Identity */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/40">
              1. Storefront Identity
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">Store / Business Name *</label>
                <input
                  type="text"
                  required
                  value={regForm.store_name}
                  onChange={e => setRegForm({
                    ...regForm,
                    store_name: e.target.value,
                    store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                  })}
                  className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                  placeholder="e.g. Suhaib Trading LLC"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">Online Store Slug (URL path) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">/store/</span>
                  <input
                    type="text"
                    required
                    value={regForm.store_slug}
                    onChange={e => setRegForm({ ...regForm, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                    className="w-full pl-16 pr-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs font-mono font-semibold text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                    placeholder="suhaib-store"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1 text-foreground">Storefront Tagline / Bio</label>
              <textarea
                rows={2}
                value={regForm.store_description}
                onChange={e => setRegForm({ ...regForm, store_description: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-2xs"
                placeholder="Brief description visible to marketplace shoppers..."
              />
            </div>
          </div>

          {/* Section 2: Contact & Location */}
          <div className="space-y-3 pt-2">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/40">
              2. Contact &amp; Regional Logistics
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">Contact Person</label>
                <input
                  type="text"
                  value={regForm.contact_name}
                  onChange={e => setRegForm({ ...regForm, contact_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">Contact Email *</label>
                <input
                  type="email"
                  required
                  value={regForm.contact_email}
                  onChange={e => setRegForm({ ...regForm, contact_email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">Contact Phone</label>
                <input
                  type="text"
                  value={regForm.contact_phone}
                  onChange={e => setRegForm({ ...regForm, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                  placeholder="+971 50 ..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-semibold block mb-1 text-foreground">City</label>
                <input
                  type="text"
                  value={regForm.city}
                  onChange={e => setRegForm({ ...regForm, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold block mb-1 text-foreground">Store Address</label>
                <input
                  type="text"
                  value={regForm.address}
                  onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:border-primary"
                  placeholder="Building, Street, Area..."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Submission & Tenant Verification */}
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/70">
            <div className="text-[11px] text-muted-foreground">
              Tenant verification: <span className="font-mono font-bold text-foreground">{currentTenantId.slice(0, 16)}...</span>
            </div>

            <button
              type="submit"
              disabled={regLoading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {regLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>Submit Registration Application</span>
            </button>
          </div>
        </form>
      </div>

      {/* Right Column (5 cols): Live Storefront Mockup Preview */}
      <div className="lg:col-span-5 space-y-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-3 card-sheen">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Marketplace Preview</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Interactive
            </span>
          </div>

          {/* Store Card Visual Preview */}
          <div className="rounded-2xl border border-border/80 bg-background/80 overflow-hidden shadow-sm">
            {/* Store Banner */}
            <div className="h-24 bg-gradient-to-r from-emerald-600 via-teal-600 to-primary flex items-end p-4 relative">
              <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-xs text-[10px] text-white px-2 py-0.5 rounded-full font-mono">
                FusionCart Web
              </div>
            </div>

            {/* Store Profile Info */}
            <div className="p-4 pt-0 relative">
              <div className="-mt-7 mb-3 flex items-end justify-between">
                <div className="h-14 w-14 rounded-2xl bg-card border-2 border-background shadow-md flex items-center justify-center font-bold text-lg text-primary">
                  {(regForm.store_name || shopName || 'ST').slice(0, 2).toUpperCase()}
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Verified Merchant</span>
                </span>
              </div>

              <h4 className="text-base font-bold text-foreground">
                {regForm.store_name || shopName || 'Store Display Name'}
              </h4>
              
              <p className="text-xs text-primary font-mono mt-0.5">
                fusioncart.io/store/{regForm.store_slug || 'your-slug'}
              </p>

              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {regForm.store_description || 'No storefront bio provided yet.'}
              </p>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{regForm.city || 'Dubai, UAE'}</span>
                </span>
                <span className="font-mono font-bold text-foreground">
                  {summary.published} Live SKUs
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 This card visualizes how your store identity, slug, and location will appear to consumers shopping across the FusionCart marketplace network.
          </p>
        </div>
      </div>
    </div>
  );
}
