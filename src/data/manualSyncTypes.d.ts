export interface ManualSyncSummary {
  pendingRows: number;
  queuedOperations: number;
  exhaustedOperations: number;
  conflicts: number;
  incompleteDownloads: number;
}
export interface ManualSyncResult {
  status: 'QUEUED' | 'CHECKED' | 'PENDING' | 'REVIEW' | 'BLOCKED' | 'FAILED';
  message: string;
  summary?: ManualSyncSummary;
  retriedOperations?: number;
}
