import { useState } from 'react';
import { ArrowRight, Check, Clock3 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TRIAL_COUNTRIES, validateTrialDetails } from './trialShopDetails';
import { BUSINESS_PROFILES } from '../../config/businessProfiles';
import { useTrialSignup } from './useTrialSignup';
import { TrialCreateAccount } from './TrialCreateAccount';
import type { TrialShopDetails } from './trialShopDetails';
import { getTimezoneAbbreviation } from '../../utils/time/timezoneHelper';

export function TrialRegistration({ onSignIn }: { onSignIn: () => void }) {
  const signup = useTrialSignup();
  const [details, setDetails] = useState<TrialShopDetails>({ shopName: '', ownerName: '', email: '', phone: '', city: '', country: 'AE', businessCategory: 'retail' });
  const [errors, setErrors] = useState<Partial<Record<keyof TrialShopDetails, string>>>({});
  const [reviewing, setReviewing] = useState(false);
  const country = TRIAL_COUNTRIES.find(item => item.code === details.country) ?? TRIAL_COUNTRIES[0];
  const profile = BUSINESS_PROFILES.find(item => item.id === (details.businessCategory || 'retail')) ?? BUSINESS_PROFILES[0];

  return (
    <div className="space-y-5">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Clock3 className="h-3 w-3" /> {signup.days ? `${signup.days} days to explore Nafid` : 'Free trial of Nafid'}</span>
        <h2 className="text-2xl font-bold mt-3">Create your Nafid account</h2>
        <p className="text-sm text-muted-foreground mt-1">A few essentials to prepare your trial workspace.</p>
      </div>
      {reviewing ? (
        <section aria-label="Review shop details" className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Your shop details</h3>
          <dl className="rounded-xl border border-border p-4 space-y-3 text-sm break-words">
            {[
              ['Shop', details.shopName.trim()], ['Owner', details.ownerName.trim()],
              ['Business category', profile.name],
              ['Email', details.email.trim()],
              ['Phone', details.phone.trim()], ['Location', `${details.city.trim()}, ${country.name}`],
              ['Suggested currency', country.currency], ['Suggested time zone', getTimezoneAbbreviation(country.timeZone)],
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
          </dl>
          <p className="text-xs text-muted-foreground">Modules and pages will be initialized for {profile.name.toLowerCase()}. You can customize any tool in Settings after registration.</p>
          <Button variant="outline" className="w-full" onClick={() => setReviewing(false)}>Edit details</Button>
          <TrialCreateAccount signup={signup} details={details} onSignIn={onSignIn} />
        </section>
      ) : (
        <form noValidate className="space-y-4" onSubmit={event => {
          event.preventDefault();
          const nextErrors = validateTrialDetails(details);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length === 0) setReviewing(true);
        }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ['shopName', 'Shop name', 'e.g. Al Noor Trading', 'text', 'organization'],
              ['ownerName', 'Your name', 'Shop owner’s name', 'text', 'name'],
              ['email', 'Email address', 'you@yourshop.com', 'email', 'email'],
              ['phone', 'Phone number', `${country.dialCode} …`, 'tel', 'tel'],
            ] as const).map(([key, label, placeholder, type, autoComplete]) => (
              <div key={key}>
                <label htmlFor={`trial-${key}`} className="block text-sm font-medium mb-1.5">{label}</label>
                <Input id={`trial-${key}`} type={type} autoComplete={autoComplete} required maxLength={key === 'phone' ? 30 : 160} value={details[key]} placeholder={placeholder}
                  aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `trial-${key}-error` : undefined}
                  onChange={event => setDetails({ ...details, [key]: event.target.value })} />
                {errors[key] && <p id={`trial-${key}-error`} className="text-xs text-destructive mt-1" role="alert">{errors[key]}</p>}
              </div>
            ))}
            <div className="sm:col-span-2">
              <label htmlFor="trial-category" className="block text-sm font-medium mb-1.5">Business category</label>
              <select id="trial-category" value={details.businessCategory || 'retail'} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold focus:ring-2 focus:ring-primary" onChange={event => setDetails({ ...details, businessCategory: event.target.value })}>
                {BUSINESS_PROFILES.map(item => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Select your starting category. You can customize or fine-tune individual modules anytime in Settings.</p>
            </div>
            <div>
              <label htmlFor="trial-country" className="block text-sm font-medium mb-1.5">Country</label>
              <select id="trial-country" value={details.country} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold focus:ring-2 focus:ring-primary" onChange={event => {
                const selected = TRIAL_COUNTRIES.find(item => item.code === event.target.value);
                if (selected) setDetails({ ...details, country: selected.code });
              }}>
                {TRIAL_COUNTRIES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="trial-city" className="block text-sm font-medium mb-1.5">City / emirate</label>
              <Input id="trial-city" autoComplete="address-level2" required maxLength={100} value={details.city} placeholder={details.country === 'AE' ? 'e.g. Dubai' : 'e.g. Kochi'} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'trial-city-error' : undefined} onChange={event => setDetails({ ...details, city: event.target.value })} />
              {errors.city && <p id="trial-city-error" className="text-xs text-destructive mt-1" role="alert">{errors.city}</p>}
            </div>
          </div>
          <Button type="submit" className="w-full h-11">Review shop details <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <p className="text-xs text-center text-muted-foreground">Already have an account? <button type="button" onClick={onSignIn} className="font-semibold text-primary hover:underline">Sign in</button></p>
        </form>
      )}
    </div>
  );
}
