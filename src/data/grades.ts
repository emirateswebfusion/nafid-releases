import { api, type WriteResult, bindBridge } from './client';

export interface Grade {
  grade_id: string;
  tenant_id: string;
  category?: string | null;
  grade_name?: string | null;
  rate?: number | null;
  purchase_price?: number | null;
  offer_price?: number | null;
  is_deleted?: number | null;
}

export interface GradeInput {
  grade_id: string;
  tenant_id: string;
  category: string;
  grade_name: string;
  rate: number;
  purchase_price?: number;
  offer_price?: number | null;
}

export async function listGrades(tenantId: string): Promise<Grade[]> {
  return (await api().dbGetGrades(tenantId)) as Grade[];
}

export async function createGrade(grade: GradeInput): Promise<WriteResult> {
  return api().dbAddGrade(grade);
}

/** Product grades. Channel catalog — the only way UI code reaches these IPC channels. */
export const gradesApi = bindBridge({
  getGrades: 'dbGetGrades',
  addGrade: 'dbAddGrade',
  updateGrade: 'dbUpdateGrade',
  deleteGrade: 'dbDeleteGrade',
});
