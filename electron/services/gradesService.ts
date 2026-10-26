import type { GradeInput } from './typesB.js';
import { getDb } from '../db/localDb.js';
import * as gradesSql from '../db/statements/grades.js';
/** grades use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getGrades` */
export function getGrades(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return gradesSql.findProductGrades(db).all(tenantId);
  } catch (error) {
    console.error('[db:getGrades]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:addGrade` */
export function addGrade(g: GradeInput) {
  try {
    const db = getDb();
    gradesSql.insertProductGrade(db).run(g.grade_id, g.tenant_id, g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null);
    return { success: true };
  } catch (error) {
    console.error('[db:addGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateGrade` */
export function updateGrade(g: GradeInput) {
  try {
    const db = getDb();
    gradesSql.updateProductGradeByGradeId(db).run(g.category, g.grade_name, g.rate, g.purchase_price || 0, g.offer_price ?? null, g.grade_id);
    return { success: true };
  } catch (error) {
    console.error('[db:updateGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:deleteGrade` */
export function deleteGrade(gradeId: string) {
  try {
    const db = getDb();
    gradesSql.updateProductGradeIsDeleted(db).run(gradeId);
    return { success: true };
  } catch (error) {
    console.error('[db:deleteGrade]', error);
    return { success: false, error: 'Operation failed' };
  }
}
