import React from 'react';
import { getStoreProfile, type StoreCountry } from '../../../utils/localization/storeProfile';
import { QrCode, Building, Check, Copy } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SUPPORTED_TIMEZONES } from '../../../utils/time/timezoneHelper';

export interface StoreSettingsTabProps {
  connectCode: string;
  copiedCode: boolean;
  setCopiedCode: (v: boolean) => void;
  shopNameLocal: string; setShopNameLocal: (v: string) => void;
  shopAddress: string; setShopAddress: (v: string) => void;
  shopPhone: string; setShopPhone: (v: string) => void;
  shopEmail: string; setShopEmail: (v: string) => void;
  shopWebsite: string; setShopWebsite: (v: string) => void;
  vatPriceInclusive: boolean; setVatPriceInclusive: (v: boolean) => void;
  storeCountry: StoreCountry; setStoreCountryState: (v: StoreCountry) => void;
  storeTimezone: string; setStoreTimezoneState: (v: string) => void;
}

/** Shop Profile: Nafid Connect code, shop name, contact details, address and store timezone. */
export const StoreSettingsTab: React.FC<StoreSettingsTabProps> = ({
  connectCode, copiedCode, setCopiedCode,
  shopNameLocal, setShopNameLocal,
  shopAddress, setShopAddress,
  shopPhone, setShopPhone,
  shopEmail, setShopEmail,
  shopWebsite, setShopWebsite,
  vatPriceInclusive, setVatPriceInclusive, storeCountry, setStoreCountryState, storeTimezone, setStoreTimezoneState,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 0: Nafid Connect Code Card */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 rounded-[28px] p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Nafid Connect Code</span>
                      <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">Peer Sync Active</span>
                    </div>
                    <h3 className="text-2xl font-black font-mono tracking-wider text-foreground mt-1">
                      {connectCode || 'Loading...'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share this unique code with counterparty shops or customers to link ledgers & auto-sync transactions in real time.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (connectCode) {
                      navigator.clipboard.writeText(connectCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? 'Copied to Clipboard!' : 'Copy Connect Code'}
                </button>
              </div>
            </div>

            <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <label className="text-sm font-bold">Country &amp; currency</label>
              <Select value={storeCountry} options={[{ value: 'IN', label: 'India — INR / GST' }, { value: 'AE', label: 'United Arab Emirates — AED / VAT' }, { value: 'BH', label: 'Bahrain — BHD / VAT' }]} onChange={value => {
                const country: StoreCountry = value === 'AE' ? 'AE' : 'IN';
                setStoreCountryState(country);
                setStoreTimezoneState(getStoreProfile(country).timezone);
              }} />
              {(storeCountry === 'AE' || storeCountry === 'BH') && <label className="flex gap-2 text-sm"><input type="checkbox" checked={vatPriceInclusive} onChange={event => setVatPriceInclusive(event.target.checked)} /> Product selling prices include VAT</label>}
              <p className="text-xs text-muted-foreground">Choose before entering products or transactions. Currency changes do not convert balances. Save to apply the profile. UAE standard VAT is 5%; zero-rated and exempt supplies need their correct product tax treatment.</p>
            </section>
            {/* Card 1: Shop Profile */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] dark:shadow-[0_4px_12px_rgba(79,70,229,0.05)] shrink-0">
                  <Building className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-foreground uppercase tracking-widest">Shop Details</span>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Name</label>
                  <Input type="text" value={shopNameLocal} onChange={(e) => setShopNameLocal(e.target.value)} placeholder="Your business name" className="font-semibold bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <Input type="text" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder={storeCountry === 'BH' ? 'e.g. +973 1712 3456' : storeCountry === 'AE' ? 'e.g. +971 50 123 4567' : 'e.g. +91 98765 43210'} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Email Address (E-Mail)</label>
                  <Input type="email" value={shopEmail} onChange={(e) => setShopEmail(e.target.value)} placeholder="e.g. info@business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Website URL (Web)</label>
                  <Input type="text" value={shopWebsite} onChange={(e) => setShopWebsite(e.target.value)} placeholder="e.g. www.business.com" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Shop Address</label>
                  <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="Enter your business address..." rows={3} className="w-full bg-background/50 border border-border/80 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all resize-none text-sm font-medium" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block flex items-center justify-between">
                    <span>Store Location & Timezone</span>
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">UTC + Store Timezone Standard</span>
                  </label>
                  <Select
                    value={storeTimezone}
                    onChange={(val) => {
                      setStoreTimezoneState(val);
                    }}
                    options={SUPPORTED_TIMEZONES}
                  />
                  <p className="text-[10px] text-muted-foreground/75 mt-1">
                    Store business dates, cashier settlement, receipts, and daily sales reports are formatted based on this store timezone. Remote owners viewing from other countries will see reports calculated for this store timezone.
                  </p>
                </div>
              </div>
            </div>
          </div>
  );
};
