/**
 * Compares two run.mts outputs call by call. Terminal codes and hold-bill suffixes are random per database,
 * so they are normalised; rows returned without ORDER BY are compared as multisets.
 * Usage: node compare.mjs base.json candidate.json   (exit 1 on any difference)
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

const [a, b] = [load(process.argv[2]), load(process.argv[3])];
if (a.length !== b.length) { console.error(`call count differs: ${a.length} vs ${b.length}`); process.exit(1); }
let diffs = 0;
a.forEach(([channel, args, ra], i) => {
  const [channelB, argsB, rb] = b[i];
  if (channel !== channelB || args !== argsB) { console.error(`#${i}: scenario diverged (${channel} vs ${channelB})`); process.exit(1); }
  if (JSON.stringify(ra) === JSON.stringify(rb) || canon(ra) === canon(rb)) return;
  diffs++;
  if (diffs <= 30) console.log(`#${i} ${channel} ${args.slice(0, 80)}\n   base: ${JSON.stringify(ra).slice(0, 300)}\n   cand: ${JSON.stringify(rb).slice(0, 300)}`);
});
console.log(`${a.length} calls compared, ${diffs} difference(s).`);
process.exit(diffs ? 1 : 0);
