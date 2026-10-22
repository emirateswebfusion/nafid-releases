import type Database from 'better-sqlite3';

/** A SQLite connection (better-sqlite3). Statement factories only need `prepare`. */
export type Db = Pick<Database.Database, 'prepare'>;
