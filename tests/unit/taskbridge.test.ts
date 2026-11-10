// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  submitToTaskBridge,
  getTaskBridgeStatus,
  getSavedReports,
  saveReportToStorage,
  updateReportInStorage,
  TB_STORAGE_KEY,
  TB_BOARD_CACHE_KEY,
  DEFAULT_BOARD_WINDOW,
  getBoardWindow,
  getProjectCommunityBoard,
  isFinishedItem,
  openItemCount,
  type CommunityBoardItem,
} from '../../src/lib/taskbridge';

type FetchArgs = [string, RequestInit];

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (..._args: FetchArgs) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('submitToTaskBridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits a defect report to the TaskBridge intake API with auth bearer and payload', async () => {
    const fetch = mockFetch(200, {
      success: true,
      trackingToken: 'tb-track-12345',
      taskUrl: 'https://taskbridge.emirateswebfusion.com/tasks/101',
      taskNumber: 101,
      ticketCode: '#101',
    });

    const res = await submitToTaskBridge({
      title: 'Tax rounding discrepancy',
      description: 'Total is 0.01 off when using 3 lines with odd decimals.',
      type: 'BUG',
      severity: 'HIGH',
      customerEmail: 'cashier@example.com',
      context: {
        shopId: 'shop-1',
      },
    });

    expect(res.success).toBe(true);
    expect(res.trackingToken).toBe('tb-track-12345');
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://taskbridge.emirateswebfusion.com/api/v1/intake');
    expect(init?.method).toBe('POST');

    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer tb_pub_live_731ef51ccc45189d');
    expect(headers.get('Content-Type')).toBe('application/json');

    const body = JSON.parse(init?.body as string);
    expect(body.title).toBe('Tax rounding discrepancy');
    expect(body.type).toBe('BUG');
    expect(body.severity).toBe('HIGH');
    expect(body.customerEmail).toBe('cashier@example.com');
    expect(body.context.shopId).toBe('shop-1');
  });

  it('defaults to BUG type and MEDIUM severity if omitted', async () => {
    const fetch = mockFetch(200, { success: true, trackingToken: 'tb-default' });

    await submitToTaskBridge({
      title: 'Simple note',
      description: 'Minor UI suggestion',
    });

    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.type).toBe('BUG');
    expect(body.severity).toBe('MEDIUM');
  });

  it('throws descriptive error when intake endpoint returns non-OK status', async () => {
    mockFetch(400, { error: 'Invalid intake project key' });

    await expect(
      submitToTaskBridge({
        title: 'Broken test',
        description: 'Should fail',
      })
    ).rejects.toThrow('Invalid intake project key');
  });
});

describe('getTaskBridgeStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches status report from TaskBridge by tracking token', async () => {
    const mockReport = {
      title: 'Tax rounding discrepancy',
      description: 'Total is 0.01 off',
      taskNumber: 101,
      projectName: 'Nafid POS',
      status: 'IN_PROGRESS',
      type: 'BUG',
      severity: 'HIGH',
      createdAt: '2026-11-08T10:00:00Z',
      updatedAt: '2026-11-08T10:30:00Z',
      resolvedAt: null,
      timeline: [
        { key: 'RECEIVED', label: 'Report Acknowledged', desc: 'Done', completed: true, current: false },
        { key: 'TRIAGED', label: 'Triaged & Planned', desc: 'Done', completed: true, current: false },
        { key: 'IN_PROGRESS', label: 'Engineering Execution', desc: 'In progress', completed: false, current: true },
        { key: 'VERIFYING', label: 'QA Verification', desc: 'Pending', completed: false, current: false },
        { key: 'RESOLVED', label: 'Verified & Released', desc: 'Pending', completed: false, current: false },
      ],
    };

    const fetch = mockFetch(200, mockReport);

    const report = await getTaskBridgeStatus('tb-track-12345');
    expect(report.title).toBe('Tax rounding discrepancy');
    expect(report.status).toBe('IN_PROGRESS');
    expect(report.timeline?.length).toBe(5);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://taskbridge.emirateswebfusion.com/api/v1/status/tb-track-12345');
    expect(init?.method).toBe('GET');
  });

  it('throws descriptive error when status fetch returns non-OK status', async () => {
    mockFetch(404, { error: 'Issue or task not found for tracking token' });

    await expect(getTaskBridgeStatus('unknown-token')).rejects.toThrow('Issue or task not found for tracking token');
  });
});

describe('localStorage report persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves reports under tb_my_reports key', () => {
    expect(getSavedReports()).toEqual([]);

    const report = {
      token: 'tok-1',
      ticketCode: '#101',
      title: 'Receipt printer bug',
      type: 'BUG',
      createdAt: '2026-11-08T12:00:00Z',
      customerStatus: 'RECEIVED',
    };

    const saved = saveReportToStorage(report);
    expect(saved).toHaveLength(1);
    expect(saved[0].token).toBe('tok-1');

    const storedRaw = localStorage.getItem(TB_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    expect(JSON.parse(storedRaw!)).toHaveLength(1);

    expect(getSavedReports()).toEqual([report]);
  });

  it('updates an existing report customerStatus in storage', () => {
    saveReportToStorage({
      token: 'tok-2',
      ticketCode: '#102',
      title: 'Dark mode contrast',
      type: 'FEATURE',
      createdAt: '2026-11-08T12:00:00Z',
      customerStatus: 'RECEIVED',
    });

    const updated = updateReportInStorage('tok-2', { customerStatus: 'RESOLVED' });
    expect(updated[0].customerStatus).toBe('RESOLVED');
    expect(getSavedReports()[0].customerStatus).toBe('RESOLVED');
  });
});

describe('community board: finished items and the Feedback badge', () => {
  const item = (over: Partial<CommunityBoardItem>): CommunityBoardItem => ({ id: 'x', title: 't', type: 'BUG', status: 'IN_PROGRESS', upvotes: 0, ...over });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('counts only open items, never fixed or closed ones', () => {
    const items = [
      item({ id: 'a', status: 'IN_PROGRESS' }),
      item({ id: 'b', status: 'RECEIVED', is_pending_review: true }),
      item({ id: 'c', status: 'RESOLVED', finished_at: '2026-11-09T10:00:00Z' }),
      item({ id: 'd', status: 'CLOSED' }), // older TaskBridge without finished_at
    ];
    expect(items.map(isFinishedItem)).toEqual([false, false, true, true]);
    expect(openItemCount(items)).toBe(2);
  });

  it('remembers the finished-items window TaskBridge sends, with a 14-day default', async () => {
    expect(getBoardWindow()).toEqual(DEFAULT_BOARD_WINDOW);
    mockFetch(200, { items: [item({ id: 'a' })], finishedWindow: { days: 7, limit: 10 } });
    await getProjectCommunityBoard(true);
    expect(getBoardWindow()).toEqual({ days: 7, limit: 10 });
    expect(JSON.parse(window.localStorage.getItem(TB_BOARD_CACHE_KEY)!).finishedWindow).toEqual({ days: 7, limit: 10 });
  });
});
