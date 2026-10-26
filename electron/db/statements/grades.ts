import type { Db } from './types.js';

/** SQL statements used by services/gradesService.ts. Each factory prepares its statement on the given connection. */

export const findProductGrades = (db: Db) => db.prepare('SELECT * FROM product_grades WHERE tenant_id = ? AND is_deleted = 0 ORDER BY category, grade_name');

export const insertProductGrade = (db: Db) => db.prepare(`
      INSERT INTO product_grades (grade_id, tenant_id, category, grade_name, rate, purchase_price, offer_price, is_deleted, sync_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
    `);

export const updateProductGradeByGradeId = (db: Db) => db.prepare(`
      UPDATE product_grades 
      SET category = ?, grade_name = ?, rate = ?, purchase_price = ?, offer_price = ?, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP 
      WHERE grade_id = ?
    `);

export const updateProductGradeIsDeleted = (db: Db) => db.prepare(`UPDATE product_grades SET is_deleted = 1, sync_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE grade_id = ?`);
