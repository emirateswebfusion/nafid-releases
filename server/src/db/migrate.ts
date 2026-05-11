import fs from 'fs';
import path from 'path';
import { pool } from './pg';

// Path to migrations directory relative to the server root
const MIGRATIONS_DIR = path.resolve(process.cwd(), '..', 'db', 'migrations');

export async function runMigrations() {
  console.log('\n[Migrations] Checking for pending migrations...');

  const client = await pool.connect();

  try {
    // 1. Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Get list of already executed migrations
    const { rows } = await client.query('SELECT name FROM migrations');
    const executedMigrations = new Set(rows.map(row => row.name));

    // 3. Read migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.warn(`[Migrations] Migration directory not found at: ${MIGRATIONS_DIR}`);
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure order (001, 002, etc.)

    let count = 0;

    for (const file of files) {
      if (!executedMigrations.has(file)) {
        console.log(`[Migrations] Executing: ${file}`);
        
        const filePath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Execute migration in a transaction
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`[Migrations] Successfully applied ${file}`);
          count++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[Migrations] Failed to apply ${file}:`, err);
          throw err; // Stop execution on failure
        }
      }
    }

    if (count === 0) {
      console.log('[Migrations] Database is up to date.');
    } else {
      console.log(`[Migrations] Finished applying ${count} migration(s).`);
    }

  } catch (err) {
    console.error('[Migrations] Critical error during migration:', err);
    throw err;
  } finally {
    client.release();
  }
}
