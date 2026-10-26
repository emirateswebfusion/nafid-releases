import type Database from 'better-sqlite3';

/**
 * Versioned migrations. Each migration runs exactly once per database, in version order, inside a transaction;
 * applied versions are recorded in `schema_migrations` and mirrored in `PRAGMA user_version`.
 *
 * The startup baseline (schema*.ts, migrations{Repairs,Columns}.ts and the repairs in localDb.ts) still runs on every
 * start: it is idempotent (tests/characterization/startup-idempotency.mts) and also normalises rows that older
 * terminals keep syncing in. It is frozen: new schema or data changes are added here as a new numbered migration.
 */
export interface Migration {
  /** 1, 2, 3, ... never reused or renumbered once released. */
  version: number;
  /** Short kebab-case description, stored with the version. */
  name: string;
  up: (db: Database.Database) => void;
}

export interface MigrationResult {
  applied: { version: number; name: string }[];
  current: number;
}

export function runMigrations(db: Database.Database, migrations: readonly Migration[]): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((m, i) => {
    if (!Number.isInteger(m.version) || m.version < 1) throw new Error(`Migration ${m.name}: version must be a positive integer`);
    if (i > 0 && sorted[i - 1].version === m.version) throw new Error(`Duplicate migration version ${m.version}`);
  });

  const done = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  const applied: { version: number; name: string }[] = [];
  for (const m of sorted) {
    if (done.has(m.version)) continue;
    // A failing migration rolls back and stops the chain: later ones may depend on it. initDb logs and continues
    // with the baseline schema, and the migration is retried on the next start.
    db.transaction(() => {
      m.up(db);
      record.run(m.version, m.name);
    })();
    applied.push({ version: m.version, name: m.name });
    console.log(`[DB Migration] Applied ${m.version} ${m.name}`);
  }
  const current = Math.max(0, ...done, ...applied.map((a) => a.version));
  db.pragma(`user_version = ${current}`);
  return { applied, current };
}
