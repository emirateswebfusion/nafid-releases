import { cloudRequest } from '../data/cloud/client';

export interface TaskBridgeSubmission {
  title: string;
  description: string;
  type?: 'BUG' | 'FEATURE' | 'PERFORMANCE' | 'SECURITY';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  customerEmail?: string;
  context?: Record<string, unknown>;
}

export interface TaskBridgeResponse {
  success: boolean;
  submissionId?: string;
  taskId?: string;
  taskNumber?: number | string;
  ticketNumber?: number | string;
  ticketCode?: string;
  trackingToken?: string;
  trackingUrl?: string;
  status?: string;
  customerStatus?: string;
  message?: string;
  taskUrl?: string;
  [key: string]: unknown;
}

export interface TaskBridgeTimelineStage {
  key: string;
  label: string;
  desc: string;
  completed: boolean;
  current: boolean;
}

export interface TaskBridgeStatusReport {
  title: string;
  description?: string;
  taskNumber?: number | string;
  projectName?: string;
  status: string;
  type?: string;
  severity?: string;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  timeline?: TaskBridgeTimelineStage[];
  [key: string]: unknown;
}

export interface SavedTaskBridgeReport {
  token: string;
  ticketCode: string;
  title: string;
  type: string;
  createdAt: string;
  customerStatus: string;
}

export const TB_STORAGE_KEY = 'tb_my_reports';

export function getSavedReports(): SavedTaskBridgeReport[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(TB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReportToStorage(report: SavedTaskBridgeReport): SavedTaskBridgeReport[] {
  if (typeof window === 'undefined' || !window.localStorage) return [report];
  try {
    const current = getSavedReports();
    const filtered = current.filter((r) => r.token !== report.token);
    const updated = [report, ...filtered];
    window.localStorage.setItem(TB_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save TaskBridge report to localStorage:', err);
    return [];
  }
}

export function updateReportInStorage(token: string, updates: Partial<SavedTaskBridgeReport>): SavedTaskBridgeReport[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const current = getSavedReports();
    const updated = current.map((r) => (r.token === token ? { ...r, ...updates } : r));
    window.localStorage.setItem(TB_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

function getBaseUrl(): string {
  const envUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TASKBRIDGE_URL) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TASKBRIDGE_URL) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_TASKBRIDGE_URL);
  return (envUrl || 'https://taskbridge.emirateswebfusion.com').replace(/\/$/, '');
}

export async function submitToTaskBridge(data: TaskBridgeSubmission): Promise<TaskBridgeResponse> {
  const baseUrl = getBaseUrl();

  const envKey =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TASKBRIDGE_PROJECT_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TASKBRIDGE_PROJECT_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_TASKBRIDGE_PROJECT_KEY);
  const projectKey = envKey || 'tb_pub_live_731ef51ccc45189d';

  const res = await cloudRequest(`${baseUrl}/api/v1/intake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${projectKey}`,
    },
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      type: data.type || 'BUG',
      severity: data.severity || 'MEDIUM',
      customerEmail: data.customerEmail || undefined,
      context: {
        ...data.context,
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: new Date().toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || 'Failed to submit issue to TaskBridge');
  }

  return (await res.json()) as TaskBridgeResponse;
}

export async function getTaskBridgeStatus(token: string): Promise<TaskBridgeStatusReport> {
  const baseUrl = getBaseUrl();
  const res = await cloudRequest(`${baseUrl}/api/v1/status/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || 'Failed to fetch status from TaskBridge');
  }

  return (await res.json()) as TaskBridgeStatusReport;
}

export interface CommunityBoardItem {
  id: string;
  task_number?: number;
  title: string;
  description?: string;
  type: string;
  status: string;
  upvotes: number;
  created_at?: string;
  /** When the item was resolved/closed (null while it is still open). Sent by TaskBridge's public board. */
  finished_at?: string | null;
  is_pending_review?: boolean;
}

/** How long TaskBridge keeps finished items on the public board (it sends this as `finishedWindow`). */
export interface BoardWindow {
  days: number;
  limit: number;
}

export const DEFAULT_BOARD_WINDOW: BoardWindow = { days: 14, limit: 20 };

export const TB_BOARD_CACHE_KEY = 'tb_board_cache';

export interface BoardCachePayload {
  items: CommunityBoardItem[];
  savedAt: number;
  finishedWindow?: BoardWindow;
}

/** Fixed or closed items are history, not open work: they never count toward the Feedback badge. */
export function isFinishedItem(item: CommunityBoardItem): boolean {
  if (item.finished_at) return true;
  const status = (item.status || '').toUpperCase();
  return !item.is_pending_review && (status === 'RESOLVED' || status === 'CLOSED');
}

export function openItemCount(items: CommunityBoardItem[]): number {
  return items.filter((item) => !isFinishedItem(item)).length;
}

function readBoardWindow(value: unknown): BoardWindow | null {
  const w = value as Partial<BoardWindow> | null | undefined;
  return w && Number.isInteger(w.days) && (w.days as number) > 0 && Number.isInteger(w.limit) && (w.limit as number) > 0
    ? { days: w.days as number, limit: w.limit as number }
    : null;
}

let boardWindow: BoardWindow | null = null;

/** The finished-items window of the last board TaskBridge sent (cached; default 14 days / 20 items). */
export function getBoardWindow(): BoardWindow {
  if (boardWindow) return boardWindow;
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_BOARD_WINDOW;
  try {
    const raw = window.localStorage.getItem(TB_BOARD_CACHE_KEY);
    return (raw && readBoardWindow((JSON.parse(raw) as BoardCachePayload).finishedWindow)) || DEFAULT_BOARD_WINDOW;
  } catch {
    return DEFAULT_BOARD_WINDOW;
  }
}

export function getCachedBoard(): CommunityBoardItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(TB_BOARD_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoardCachePayload;
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function saveBoardToCache(items: CommunityBoardItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: BoardCachePayload = { items, savedAt: Date.now(), finishedWindow: getBoardWindow() };
    window.localStorage.setItem(TB_BOARD_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to cache community board to storage:', err);
  }
}

let cachedBoard: { data: CommunityBoardItem[]; timestamp: number } | null = null;

export async function getProjectCommunityBoard(forceRefresh = false): Promise<CommunityBoardItem[]> {
  const now = Date.now();
  if (!forceRefresh && cachedBoard && now - cachedBoard.timestamp < 30000) {
    return cachedBoard.data;
  }

  const localItems = getCachedBoard();
  if (!forceRefresh && localItems.length > 0 && !cachedBoard) {
    cachedBoard = { data: localItems, timestamp: now };
  }

  try {
    const baseUrl = getBaseUrl();
    const envKey =
      (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TASKBRIDGE_PROJECT_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TASKBRIDGE_PROJECT_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_TASKBRIDGE_PROJECT_KEY);
    const projectKey = envKey || 'tb_pub_live_731ef51ccc45189d';

    const res = await cloudRequest(`${baseUrl}/api/v1/public?projectKey=${encodeURIComponent(projectKey)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return cachedBoard?.data || localItems;

    const data = (await res.json()) as { items?: CommunityBoardItem[]; finishedWindow?: unknown };
    const items = data.items || [];
    boardWindow = readBoardWindow(data.finishedWindow) || boardWindow;
    cachedBoard = { data: items, timestamp: now };
    saveBoardToCache(items);
    return items;
  } catch (err) {
    console.warn('Could not load community board from network, using local cache:', err);
    return cachedBoard?.data || localItems;
  }
}

export async function upvoteTaskBridgeTask(taskId: string): Promise<number> {
  const baseUrl = getBaseUrl();
  const res = await cloudRequest(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}/upvote`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || 'Failed to upvote task');
  }

  const data = (await res.json()) as { success: boolean; upvotes: number };
  return data.upvotes;
}

export const DEFAULT_STAGES = [
  { key: 'RECEIVED', label: 'Report Acknowledged', desc: 'Issue registered in TaskBridge intake queue' },
  { key: 'TRIAGED', label: 'Triaged & Planned', desc: 'Acceptance criteria and reproduction steps established' },
  { key: 'IN_PROGRESS', label: 'Engineering Execution', desc: 'Fix being implemented in an isolated workspace' },
  { key: 'VERIFYING', label: 'QA Verification', desc: 'Automated test suite and regression checks running' },
  { key: 'RESOLVED', label: 'Verified & Released', desc: 'Changes confirmed and deployed in target project' },
];

export function getStatusBadge(status?: string): { label: string; color: string } {
  const norm = (status || 'RECEIVED').toUpperCase();
  switch (norm) {
    case 'RECEIVED':
    case 'NEW':
      return { label: 'Received', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' };
    case 'TRIAGED':
      return { label: 'Triaged', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' };
    case 'IN_PROGRESS':
    case 'IN PROGRESS':
      return { label: 'In Progress', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' };
    case 'VERIFYING':
      return { label: 'Verifying', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' };
    case 'RESOLVED':
      return { label: 'Resolved', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
    case 'CLOSED':
      return { label: 'Closed', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30' };
    default:
      return { label: status || 'Pending', color: 'bg-muted text-muted-foreground border-border' };
  }
}


