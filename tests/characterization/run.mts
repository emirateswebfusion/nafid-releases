/**
 * Replays the IPC scenario against one checkout of the POS main process and writes the normalised results.
 * Usage (see README.md): EQ_USERDATA=<empty dir> npx tsx run.mts <treeRoot> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tree = path.resolve(process.argv[2]);
const out = process.argv[3];
const handlers: Map<string, Function> = ((globalThis as any).__handlers ||= new Map());
const realErr = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};

const { initDb } = await import(pathToFileURL(path.join(tree, 'electron/db/localDb.ts')).href);
initDb();
const ipc = await import(pathToFileURL(path.join(tree, 'electron/ipc/index.ts')).href);
ipc.registerAllIpcHandlers();

const event = { sender: { send() {}, isDestroyed: () => false } };
const results: [string, string, unknown][] = [];
const normalise = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (_k, x) => typeof x === 'string'
  ? x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
     .replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>')
     .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
     .replace(/\b1[789]\d{11}\b/g, '<ms>')
     .replace(/\b\d{1,2}:\d{2}( ?[AP]M)?\b/g, '<time>')
  : x));

async function call(channel: string, ...args: unknown[]) {
  const fn = handlers.get(channel);
  if (!fn) { results.push([channel, JSON.stringify(args), 'NO_HANDLER']); return undefined; }
  let r: unknown;
  try { r = await Promise.race([Promise.resolve(fn(event, ...args)), new Promise((res) => setTimeout(() => res('TIMEOUT'), 3000))]); }
  catch (e: any) { r = { THROWN: String(e?.message || e) }; }
  results.push([channel, JSON.stringify(normalise(args)), normalise(r)]);
  return r;
}

const scenario = await import(pathToFileURL(path.join(here, 'scenario.mts')).href);
await scenario.default(call, [...handlers.keys()]);
fs.writeFileSync(out, JSON.stringify(results, null, 1));
realErr(`${path.basename(tree)}: ${results.length} calls over ${handlers.size} handlers -> ${out}`);
process.exit(0);
