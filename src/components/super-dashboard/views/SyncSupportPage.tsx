import { useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { loadSyncSupport, type SyncSupportReport } from '../../../data/cloud/syncSupport';
export function SyncSupportPage() {
  const role = useAuthStore(state => state.role);
  const [reports, setReports] = useState<SyncSupportReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  if (role !== 'SUPER_ADMIN') return null;
  const refresh = async () => {
    setBusy(true); setError('');
    try { const result = await loadSyncSupport(); setReports(result.reports); setLoaded(true); }
    catch { setError('Unable to load shop reports. Check the support API deployment and connection.'); }
    finally { setBusy(false); }
  };
  return <section className="mb-6 rounded-xl border border-border bg-card p-5 space-y-4">
    <h2 className="text-lg font-semibold">Shop sync support</h2>
    <p className="text-sm text-muted-foreground">Developer diagnostics from reporting terminals. Missing or old reports do not mean a shop is healthy. Reports require the updated POS and a working cloud connection.</p>
    <div className="flex gap-3"><input aria-label="Find shop or terminal" placeholder="Find shop or terminal" value={search} onChange={e => setSearch(e.target.value)} className="border rounded p-2 bg-background" />
      <button type="button" disabled={busy} onClick={() => { void refresh(); }} className="border rounded px-3">{busy ? 'Loading...' : 'Refresh reports'}</button></div>
    {error && <p role="alert">{error}</p>}
    {loaded && !reports.length && <p>No terminal reports received yet. Existing installations do not report until updated.</p>}
    {reports.filter(row => `${row.shop_name} ${row.tenant_id} ${row.terminal_id}`.toLowerCase().includes(search.toLowerCase())).map(row => <article key={`${row.tenant_id}:${row.terminal_id}`} className="border rounded-lg p-4 space-y-2">
      <h3 className="font-semibold">{row.shop_name}</h3>
      <p className="text-xs break-all">Shop: {row.tenant_id} · Terminal: {row.terminal_id} · POS {row.report.version} · {row.report.platform} · Route {row.report.route}</p>
      <p className="text-xs">Received: {row.received_at} · Observed: {row.report.observed_at}</p>
      <p>Pending: {row.report.pending} · Conflicts: {row.report.conflicts} · Incomplete downloads: {row.report.downloads}</p>
      <details><summary className="cursor-pointer">Record diagnostics ({row.report.issues.length}, maximum 100)</summary>
        <p className="my-2 text-xs text-muted-foreground">BASE_REQUIRED: no captured cloud revision. CLOUD_REVISION_CONFLICT: a different cloud revision was reported. PARENT_UNAVAILABLE: linked account unavailable. WAITING_UPLOAD/UPLOAD_FAILED: pending/failed account row without a conflict marker. Compare the exact record before repair; these codes never authorize overwriting financial data.</p>
        {row.report.issues.length ? <div className="overflow-x-auto"><table className="text-xs w-full"><thead><tr>{['Entity', 'Record ID', 'Reason', 'State', 'Version', 'Captured base', 'Updated'].map(label => <th key={label} className="text-left p-2">{label}</th>)}</tr></thead>
          <tbody>{row.report.issues.map((issue, i) => <tr key={`${issue.entity}:${issue.entity_id}:${i}`}>{[issue.entity, issue.entity_id, issue.code, issue.sync_status, issue.row_version, issue.base, issue.updated_at].map((value, j) => <td key={j} className="p-2 break-all">{value}</td>)}</tr>)}</tbody></table></div> : <p>No pending account record details in this snapshot.</p>}
      </details>
    </article>)}
  </section>;
}
