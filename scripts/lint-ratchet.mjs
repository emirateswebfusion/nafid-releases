#!/usr/bin/env node
/**
 * Lint ratchet: the repository already has thousands of lint errors.
 * This script fails only when the error/warning count increases, so new
 * code cannot make the situation worse while the backlog is paid down.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs            # compare against baseline
 *   node scripts/lint-ratchet.mjs --update   # record the current counts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'lint-baseline.json');
const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const update = process.argv.includes('--update');

const run = spawnSync(process.execPath, [eslintBin, '.', '-f', 'json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

if (run.error) {
  console.error(`Unable to run ESLint: ${run.error.message}`);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(run.stdout || '[]');
} catch {
  console.error('ESLint did not return JSON. Output follows:');
  console.error((run.stdout || '').slice(0, 4000));
  console.error(run.stderr || '');
  process.exit(2);
}

const errors = report.reduce((total, file) => total + file.errorCount, 0);
const warnings = report.reduce((total, file) => total + file.warningCount, 0);
const byRule = {};
for (const file of report) {
  for (const message of file.messages) {
    const rule = message.ruleId || 'fatal';
    byRule[rule] = (byRule[rule] || 0) + 1;
  }
}

if (update || !existsSync(baselinePath)) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ errors, warnings, byRule, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`Lint baseline saved: ${errors} errors, ${warnings} warnings`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const errorDelta = errors - baseline.errors;
const warningDelta = warnings - baseline.warnings;

if (errorDelta <= 0 && warningDelta <= 0) {
  const improvement = Math.abs(errorDelta) + Math.abs(warningDelta);
  console.log(
    `Lint ratchet passed: ${errors} errors, ${warnings} warnings` +
      (improvement > 0 ? ` (${improvement} better than baseline)` : ''),
  );
  process.exit(0);
}

console.error(
  `Lint ratchet failed: ${errors} errors (baseline ${baseline.errors}), ` +
    `${warnings} warnings (baseline ${baseline.warnings}).`,
);
console.error('Rules that increased:');
for (const [rule, count] of Object.entries(byRule)) {
  const previous = baseline.byRule?.[rule] || 0;
  if (count > previous) console.error(`  ${rule}: ${previous} -> ${count} (+${count - previous})`);
}
console.error('Fix the new issues, or run `npm run lint:baseline` only when intentionally re-baselining.');
process.exit(1);
