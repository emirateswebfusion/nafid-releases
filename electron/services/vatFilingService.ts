import crypto from 'crypto';
import { getDb } from '../db/localDb.js';
import * as vatSql from '../db/statements/vatReports.js';

export interface LocalVatFilingRow {
  id: string;
  period: string;
  return_type: string;
  status: 'DRAFT' | 'APPROVED' | 'FILED';
  filing_mode: 'EMARATAX_PORTAL' | 'OFFLINE_FAF' | 'OFFLINE_EXCEL';
  acknowledgement_number?: string | null;
  filing_date?: string | null;
  net_output_vat: number;
  recoverable_input_vat: number;
  net_vat_payable: number;
  net_vat_status: 'PAYABLE' | 'RECLAIMABLE' | 'NIL';
  summary_payload?: string | null;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** IPC: db:getLocalVatFilings */
export function getLocalVatFilings(): LocalVatFilingRow[] | { error: string } {
  try {
    const db = getDb();
    const rows = vatSql.getLocalVatFilings(db).all() as LocalVatFilingRow[];
    return rows;
  } catch (err) {
    console.error('[db:getLocalVatFilings]', err);
    return { error: String(err) };
  }
}

/** IPC: db:upsertLocalVatFiling */
export function upsertLocalVatFiling(payload: {
  id?: string;
  period: string;
  return_type?: string;
  status: string;
  filing_mode: string;
  net_output_vat: number;
  recoverable_input_vat: number;
  net_vat_payable: number;
  net_vat_status: string;
  summary_payload?: string;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
}): { success: boolean; id?: string } | { error: string } {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    const returnType = payload.return_type || 'VAT201';
    vatSql.upsertLocalVatFiling(db).run(
      id,
      payload.period,
      returnType,
      payload.status,
      payload.filing_mode,
      payload.net_output_vat,
      payload.recoverable_input_vat,
      payload.net_vat_payable,
      payload.net_vat_status,
      payload.summary_payload || null,
      payload.notes || null,
      payload.approved_by || null,
      payload.approved_at || null,
      now,
      now
    );
    return { success: true, id };
  } catch (err) {
    console.error('[db:upsertLocalVatFiling]', err);
    return { error: String(err) };
  }
}

/** IPC: db:recordLocalVatManualAck */
export function recordLocalVatManualAck(payload: {
  id?: string;
  period: string;
  return_type?: string;
  filing_mode?: string;
  acknowledgement_number: string;
  filing_date: string;
  net_output_vat: number;
  recoverable_input_vat: number;
  net_vat_payable: number;
  net_vat_status: string;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
}): { success: boolean; id?: string } | { error: string } {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    const returnType = payload.return_type || 'VAT201';
    const filingMode = payload.filing_mode || 'EMARATAX_PORTAL';
    vatSql.recordLocalVatManualAck(db).run(
      id,
      payload.period,
      returnType,
      filingMode,
      payload.acknowledgement_number,
      payload.filing_date,
      payload.net_output_vat,
      payload.recoverable_input_vat,
      payload.net_vat_payable,
      payload.net_vat_status,
      payload.notes || null,
      payload.approved_by || null,
      payload.approved_at || null,
      now,
      now
    );
    return { success: true, id };
  } catch (err) {
    console.error('[db:recordLocalVatManualAck]', err);
    return { error: String(err) };
  }
}
