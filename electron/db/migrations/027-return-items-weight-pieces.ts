import type { Migration } from './runner.js';

export const m027ReturnItemsWeightPieces: Migration = {
  version: 27,
  name: 'return-items-weight-pieces',
  up(db) {
    const itemCols = (db.prepare('PRAGMA table_info(return_items)').all() as { name: string }[]).map(c => c.name);
    if (!itemCols.includes('pieces_sold')) {
      db.exec('ALTER TABLE return_items ADD COLUMN pieces_sold INTEGER');
    }
    if (!itemCols.includes('billing_type')) {
      db.exec('ALTER TABLE return_items ADD COLUMN billing_type TEXT');
    }
    if (!itemCols.includes('uom')) {
      db.exec('ALTER TABLE return_items ADD COLUMN uom TEXT');
    }
  },
};
