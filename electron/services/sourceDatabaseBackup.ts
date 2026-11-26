import { app } from 'electron';
import { mkdir, rename, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { getDb } from '../db/localDb.js';
import * as meta from '../db/statements/sync/accountMetadata.js';
async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Online SQLite backup yields between small page batches; never close/reopen the billing database. */
export async function ensureSourceDatabaseBackup(tenant: string, job: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(job)) throw new Error('Invalid backup identity');
  const db = getDb(), key = `source_recovery_db_backup:${tenant}:${job}`;
  const folder = path.join(app.getPath('userData'), 'source-recovery-backups');
  await mkdir(folder, { recursive: true });
  const destination = path.join(folder, `${job}.sqlite`), partial = `${destination}.partial`;
  const saved = meta.read(db).get(key) as { value: string } | undefined;
  if (saved) {
    const recorded = JSON.parse(saved.value) as { size: number; sha256: string };
    if (Number.isSafeInteger(recorded.size) && recorded.size > 0 && (await stat(destination)).size === recorded.size
      && await digest(destination) === recorded.sha256) return;
    throw new Error('Retained database backup is unavailable');
  }
  // A final file left by a crash before metadata commit is retained, never overwritten.
  try { if ((await stat(destination)).size > 0) throw new Error('Unconfirmed backup requires review'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await rm(partial, { force: true });
  const result = await db.backup(partial, { progress: () => 128 });
  if (result.remainingPages !== 0 || result.totalPages < 1 || (await stat(partial)).size < 512) throw new Error('Database backup incomplete');
  await rename(partial, destination);
  meta.write(db).run(key, JSON.stringify({ size: (await stat(destination)).size, sha256: await digest(destination) }));
}
