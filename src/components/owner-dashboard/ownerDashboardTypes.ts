/** Owner dashboard: props, sync progress shape and the "time ago" label helper. */
export function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return '1m ago';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1h ago';
    return `${hours}h ago`;
}

export interface SyncProgress {
    percent: number;
    label: string;
    recordsSynced: number;
    totalRecords: number;
}

export interface OwnerDashboardProps {
    isSyncing: boolean;
    syncProgress: SyncProgress | null;
    syncComplete: boolean;
    shuffledQuotes: number[];
    quoteIndex: number;
    QUOTES: { text: string; author: string }[];
}
