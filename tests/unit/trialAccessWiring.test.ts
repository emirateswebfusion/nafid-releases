import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// useTrialSession renews the 24-hour trial lease and enforces expiry offline. It only works when App mounts it:
// it shipped once unmounted, so expired trials kept full POS access offline and leases were never renewed.
it('mounts the trial access guard for signed-in shops', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/const trialAccess = useTrialSession\(\);/);
  expect(app).toMatch(/if \(trialAccess\.blocked\) \{\s*return <TrialAccessScreen error=\{trialAccess\.error\} retry=\{trialAccess\.retry\} \/>;/);
  // Hooks must run before the early returns (splash / login) to keep hook order stable.
  expect(app.indexOf('useTrialSession();')).toBeLessThan(app.indexOf('return <SplashScreen />'));
});
