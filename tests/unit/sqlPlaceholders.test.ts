/**
 * SQL parameters in the main process are plain `?` or named. Numbered ones (`?1`) pass the unit tests, which run on
 * node:sqlite, but better-sqlite3 in the app rejects re-used numbers ("Too many parameter values were provided"):
 * v2.2.34 failed every credit bill save that way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const roots = ['electron'];
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.ts$/.test(e.name)) files.push(p);
  }
};
for (const r of roots) walk(path.resolve(__dirname, '../..', r));

it('no SQL in the main process uses numbered parameters', () => {
  const offenders = files.flatMap((f) => {
    const text = fs.readFileSync(f, 'utf8');
    return [...text.matchAll(/`[^`]*\b(?:SELECT|UPDATE|INSERT|DELETE|WHERE|SET)\b[^`]*`/gis)]
      .filter((m) => /\?\d/.test(m[0]))
      .map((m) => `${path.relative(process.cwd(), f)}: ${m[0].slice(0, 80).replace(/\s+/g, ' ')}`);
  });
  expect(offenders).toEqual([]);
});
