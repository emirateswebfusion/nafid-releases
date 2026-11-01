import { DatabaseSync } from 'node:sqlite';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { m013GstPhase2aLocalFilings } from '../../electron/db/migrations/013-gst-phase2a-local-filings';

const state = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock('../../electron/db/localDb', () => ({ getDb: () => state.db }));

import {
  getLocalGstFilings,
  upsertLocalGstFiling,
  recordLocalManualAcknowledgement
} from '../../electron/services/gstReportService';

describe('GST Phase 2A Local Filing Statements & Workflow', () => {
  let raw: DatabaseSync;

  beforeEach(() => {
    raw = new DatabaseSync(':memory:');
    state.db = Object.assign(raw, {
      transaction: (fn: () => unknown) => () => fn(),
    }) as unknown as Database.Database;

    // Run migration 013
    m013GstPhase2aLocalFilings.up(state.db);
  });

  afterEach(() => {
    raw.close();
  });

  it('initializes gst_local_filings table with correct schema', () => {
    const tableInfo = state.db.prepare("PRAGMA table_info('gst_local_filings')").all() as Array<{ name: string }>;
    const columnNames = tableInfo.map(col => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('period');
    expect(columnNames).toContain('return_type');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('filing_mode');
    expect(columnNames).toContain('acknowledgement_number');
    expect(columnNames).toContain('filing_date');
    expect(columnNames).toContain('gross_taxable_value');
    expect(columnNames).toContain('total_tax_amount');
    expect(columnNames).toContain('approved_by');
  });

  it('upserts and retrieves a draft filing record through service IPC', () => {
    const result = upsertLocalGstFiling({
      id: 'filing-1',
      period: '2026-11',
      return_type: 'GSTR1',
      status: 'DRAFT',
      filing_mode: 'OFFLINE_MANUAL',
      gross_taxable_value: 150000.0,
      total_tax_amount: 27000.0,
      summary_payload: JSON.stringify({ summary: { total: 177000 } }),
    });

    expect('success' in result && result.success).toBe(true);

    const filings = getLocalGstFilings();
    expect(Array.isArray(filings)).toBe(true);
    if (Array.isArray(filings)) {
      expect(filings).toHaveLength(1);
      expect(filings[0].period).toBe('2026-11');
      expect(filings[0].return_type).toBe('GSTR1');
      expect(filings[0].status).toBe('DRAFT');
      expect(filings[0].gross_taxable_value).toBe(150000.0);
      expect(filings[0].total_tax_amount).toBe(27000.0);
    }
  });

  it('updates filing status to APPROVED on subsequent upsert', () => {
    upsertLocalGstFiling({
      id: 'filing-1',
      period: '2026-11',
      return_type: 'GSTR1',
      status: 'DRAFT',
      filing_mode: 'OFFLINE_MANUAL',
      gross_taxable_value: 150000.0,
      total_tax_amount: 27000.0,
    });

    const now = new Date().toISOString();
    // Approve filing
    const approvedResult = upsertLocalGstFiling({
      id: 'filing-1',
      period: '2026-11',
      return_type: 'GSTR1',
      status: 'APPROVED',
      filing_mode: 'OFFLINE_MANUAL',
      gross_taxable_value: 150000.0,
      total_tax_amount: 27000.0,
      approved_by: 'Owner Suhaib',
      approved_at: now,
    });

    expect('success' in approvedResult && approvedResult.success).toBe(true);

    const filings = getLocalGstFilings();
    if (Array.isArray(filings)) {
      expect(filings).toHaveLength(1);
      expect(filings[0].status).toBe('APPROVED');
      expect(filings[0].approved_by).toBe('Owner Suhaib');
      expect(filings[0].approved_at).toBe(now);
    }
  });

  it('records manual portal filing acknowledgement with ARN', () => {
    const now = new Date().toISOString();
    const arn = 'AA3205260009876';
    const filingDate = '2026-11-10';

    const ackResult = recordLocalManualAcknowledgement({
      id: 'filing-ack-1',
      period: '2026-11',
      return_type: 'GSTR1',
      acknowledgement_number: arn,
      filing_date: filingDate,
      gross_taxable_value: 150000.0,
      total_tax_amount: 27000.0,
      approved_by: 'Owner Suhaib',
      approved_at: now,
    });

    expect('success' in ackResult && ackResult.success).toBe(true);

    const filings = getLocalGstFilings();
    if (Array.isArray(filings)) {
      expect(filings).toHaveLength(1);
      expect(filings[0].status).toBe('FILED');
      expect(filings[0].filing_mode).toBe('OFFLINE_MANUAL');
      expect(filings[0].acknowledgement_number).toBe(arn);
      expect(filings[0].filing_date).toBe(filingDate);
    }
  });
});
