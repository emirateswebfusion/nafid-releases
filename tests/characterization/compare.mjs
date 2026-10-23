/**
 * Compares two run.mts outputs call by call. Terminal codes and hold-bill suffixes are random per database,
 * so they are normalised; rows returned without ORDER BY are compared as multisets.
 *
 * Sync results (sync-run.mts: entries labelled `http:N`): the main cycle and the "urgent" syncs run concurrently, so
 * how many times an identical read (`GET /health`, `GET /api/sync/quotations?...`) repeats depends on machine timing.
 * Within each phase, repeated identical GET requests are compared once; every other request (all pushes and
 * delta-pull POSTs) keeps its exact count and order. `--strict` turns this off.
 *
 * Usage: node compare.mjs [--strict] base.json candidate.json   (exit 1 on any difference)
 */
import fs from 'node:fs';

function load(file) {
  let text = fs.readFileSync(file, 'utf8');
  const codes = new Set([...text.matchAll(/"([A-Z0-9]{4})-(?:\d{3}|PUR|QTN|RTN|SCR)/g)].map((m) => m[1]));
  for (const c of codes) text = text.replace(new RegExp(`\\b${c}\\b`, 'g'), '<TC>');
  text = text.replace(/HLD-<ms>-\d{4}/g, 'HLD-<ms>-<r>');
  return JSON.parse(text);
}
const canon = (v) => Array.isArray(v) ? JSON.stringify(v.map(canon).sort()) : v && typeof v === 'object'
  ? JSON.stringify(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : JSON.stringify(v);

/** Sync results: drop repeated identical GETs within a phase and the `:N` from `http:N` labels. */
function collapseRepeatedReads(entries) {
  if (!entries.some(([label]) => /^http:\d+$/.test(label))) return { entries, collapsed: 0 };
  const out = [];
  let seen = new Set();
  let collapsed = 0;
  for (const [label, args, result] of entries) {
    if (!/^http:\d+$/.test(label)) { seen = new Set(); out.push([label, args, result]); continue; }
    if (String(args).startsWith('GET ')) {
      const key = `${args}\u0000${JSON.stringify(result)}`;
      if (seen.has(key)) { collapsed++; continue; }
      seen.add(key);
    }
    out.push(['http', args, result]);
  }
  return { entries: out, collapsed };
}

const strict = process.argv.includes('--strict');
const files = process.argv.slice(2).filter((x) => x !== '--strict');
let [a, b] = [load(files[0]), load(files[1])];
if (!strict) {
  const [ca, cb] = [collapseRepeatedReads(a), collapseRepeatedReads(b)];
  [a, b] = [ca.entries, cb.entries];
  if (ca.collapsed || cb.collapsed) console.log(`(repeated identical GET requests compared once: ${ca.collapsed} in ${files[0]}, ${cb.collapsed} in ${files[1]})`);
}
if (a.length !== b.length) { console.error(`call count differs: ${a.length} vs ${b.length}`); process.exit(1); }
let diffs = 0;
a.forEach(([channel, args, ra], i) => {
  const [channelB, argsB, rb] = b[i];
  if (channel !== channelB || args !== argsB) { console.error(`#${i}: scenario diverged (${channel} ${String(args).slice(0, 60)} vs ${channelB} ${String(argsB).slice(0, 60)})`); process.exit(1); }
  if (JSON.stringify(ra) === JSON.stringify(rb) || canon(ra) === canon(rb)) return;
  diffs++;
  if (diffs <= 30) console.log(`#${i} ${channel} ${args.slice(0, 80)}\n   base: ${JSON.stringify(ra).slice(0, 300)}\n   cand: ${JSON.stringify(rb).slice(0, 300)}`);
});
console.log(`${a.length} calls compared, ${diffs} difference(s).`);
process.exit(diffs ? 1 : 0);
