import { Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { useTrialSignup } from './useTrialSignup';
import type { TrialShopDetails } from './trialShopDetails';

export function TrialCreateAccount({ signup, details, onSignIn }: { signup: ReturnType<typeof useTrialSignup>; details: TrialShopDetails; onSignIn: () => void }) {
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void signup.submit(details); }}>
    {!signup.created && <>
      <div><label htmlFor="trial-password" className="block text-sm font-medium mb-1.5">Password</label>
        <Input id="trial-password" type="password" autoComplete="new-password" required minLength={8} value={signup.password} disabled={signup.busy} onChange={event => signup.setPassword(event.target.value)} placeholder="At least 8 characters" /></div>
      <div><label htmlFor="trial-confirm-password" className="block text-sm font-medium mb-1.5">Confirm password</label>
        <Input id="trial-confirm-password" type="password" autoComplete="new-password" required value={signup.confirmPassword} disabled={signup.busy} onChange={event => signup.setConfirmPassword(event.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Your trial starts when your account is created. Internet is needed to register and renew offline access at least once every 24 hours.</p>
    </>}
    {signup.error && <p role="alert" className="text-sm text-destructive">{signup.error}</p>}
    {signup.created ? <Button type="button" className="w-full" onClick={onSignIn}>Sign in to your account</Button> : <Button type="submit" disabled={signup.busy || !signup.days} className="w-full h-11">
      {signup.busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{signup.busy ? 'Creating your shop…' : `Start ${signup.days ?? ''}-day free trial`}
    </Button>}
  </form>;
}
