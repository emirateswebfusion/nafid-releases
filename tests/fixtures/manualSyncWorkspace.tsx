import { createRoot } from 'react-dom/client';
import { ManualSyncPanel } from '../../src/components/settings/tabs/ManualSyncPanel';
import type { ManualSyncResult } from '../../src/data/manualSyncTypes';
import '../../src/index.css';
let scenario = 'QUEUED';
const cases: Record<string, ManualSyncResult> = {
  QUEUED: { status: 'QUEUED', message: 'Request saved. You can continue working.' },
  REVIEW: { status: 'REVIEW', message: 'Some changes need support review. Your local data is kept; no conflicting records were overwritten automatically.' },
  PENDING: { status: 'PENDING', message: 'Sync was attempted. Some changes are still waiting; your local work is kept.' },
  CHECKED: { status: 'CHECKED', message: 'Sync check finished. No pending local uploads were detected.' },
  FAILED: { status: 'FAILED', message: 'Cloud sync is unavailable. Check your internet connection or reconnect cloud sign-in. Your local work is kept.' },
};
Object.defineProperty(window, 'electronAPI', { value: { manualCloudSync: async () => { await new Promise(resolve => setTimeout(resolve, 500)); return cases[scenario]; } } });
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl p-6 space-y-4">
  <h1 className="text-xl font-bold">Synthetic test shop</h1><p>No real shop data, database access or network requests. This fixture exercises the actual POS sync button.</p>
  <label>Test scenario <select className="border rounded p-2" defaultValue={scenario} onChange={event => { scenario = event.target.value; }}>
    {Object.keys(cases).map(key => <option key={key}>{key}</option>)}
  </select></label><ManualSyncPanel />
</main>);
