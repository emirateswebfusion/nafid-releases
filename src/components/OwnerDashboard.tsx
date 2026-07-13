import { useState, useRef, useEffect, useCallback } from 'react';
import { ShoppingBag, Users, User, TrendingUp, Settings, Package, ArrowRight, LogOut, Sun, Moon, Handshake, FileText, Trash, Printer, Shield, Receipt, Banknote } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';

function timeAgo(timestamp: number): string {
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

interface SyncProgress {
    percent: number;
    label: string;
    recordsSynced: number;
    totalRecords: number;
}

interface OwnerDashboardProps {
    isSyncing: boolean;
    syncProgress: SyncProgress | null;
    syncComplete: boolean;
    shuffledQuotes: number[];
    quoteIndex: number;
    QUOTES: { text: string; author: string }[];
}

export function OwnerDashboard({ isSyncing, syncProgress, syncComplete, shuffledQuotes, quoteIndex, QUOTES }: OwnerDashboardProps) {
    const { shopName, userName, lastSyncTime, setLastSyncTime, tenantId } = useAuthStore();
    const { setRole } = useCartStore();
    const { theme, toggleTheme } = useThemeStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [displayTime, setDisplayTime] = useState('...');
    const [totalSales, setTotalSales] = useState(0);
    const [invoiceCount, setInvoiceCount] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const [enableScrap, setEnableScrap] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadStats = useCallback(async () => {
        if (!window.electronAPI?.dbGetDashboardStats || !tenantId) return;
        const result = await window.electronAPI.dbGetDashboardStats(tenantId);
        if (result.success) {
            setTotalSales(result.totalSales ?? 0);
            setInvoiceCount(result.invoiceCount ?? 0);
        }
    }, [tenantId]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useEffect(() => {
        if (!window.electronAPI) return;
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: any) => {
            if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
        });
    }, [tenantId]);

    useEffect(() => {
        if (!window.electronAPI?.onSyncCycleComplete) return;
        const now = Date.now();
        setLastSyncTime(now);
        setDisplayTime('just now');
        window.electronAPI.onSyncCycleComplete(() => {
            const t = Date.now();
            setLastSyncTime(t);
            setDisplayTime('just now');
            loadStats();
        });
    }, [setLastSyncTime, loadStats]);

    useEffect(() => {
        if (window.electronAPI?.onOnlineStatus) {
            window.electronAPI.onOnlineStatus(setIsOnline);
            return;
        }
        setIsOnline(navigator.onLine);
        const handler = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', handler);
        window.addEventListener('offline', handler);
        return () => {
            window.removeEventListener('online', handler);
            window.removeEventListener('offline', handler);
        };
    }, []);

    useEffect(() => {
        if (!lastSyncTime) return;
        const interval = setInterval(() => {
            setDisplayTime(timeAgo(lastSyncTime));
        }, 10000);
        return () => clearInterval(interval);
    }, [lastSyncTime]);

    const cards = [
        {
            id: 'billing',
            title: 'Billing',
            desc: 'Create new invoices and manage sales',
            icon: ShoppingBag,
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            action: () => setRole('BILLER'),
            shortcut: 'F1'
        },
        {
            id: 'cashier',
            title: 'Cash Settlement',
            desc: 'Settle pending bills, manage cash drawer, and day-end closing',
            icon: Banknote,
            color: 'text-yellow-500',
            bgColor: 'bg-yellow-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-cashier-settlement')),
        },
        {
            id: 'inventory',
            title: 'Inventory Manager',
            desc: 'Manage products, stock levels, and pricing',
            icon: Package,
            color: 'text-cyan-500',
            bgColor: 'bg-cyan-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-inventory-manager')),
        },
        {
            id: 'stock-print',
            title: 'Stock Report',
            desc: 'Print A4 stock reports with PDF export',
            icon: Printer,
            color: 'text-teal-500',
            bgColor: 'bg-teal-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-stock-report')),
        },
        {
            id: 'quotations',
            title: 'Quotations',
            desc: 'Create and manage A4 quotations',
            icon: FileText,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-quotation-manager')),
        },
        {
            id: 'purchase-bills',
            title: 'Purchase Bills',
            desc: 'Record and manage GST purchase bills',
            icon: Receipt,
            color: 'text-pink-500',
            bgColor: 'bg-pink-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-purchase-bills')),
        },
        {
            id: 'warranties',
            title: 'Warranty Bills',
            desc: 'Register and print warranty certificates',
            icon: Shield,
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-warranty-manager')),
        },
        ...(enableScrap ? [{
            id: 'scrap',
            title: 'Scrap Management',
            desc: 'Track scrap purchases, sales & profit',
            icon: Trash,
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-scrap-manager')),
        }] : []),
        {
            id: 'parties',
            title: 'Parties / Credit',
            desc: 'Track credit parties, balances, and payments',
            icon: Handshake,
            color: 'text-rose-500',
            bgColor: 'bg-rose-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-parties-manager')),
        },
        {
            id: 'customers',
            title: 'Customers',
            desc: 'Browse customer list, points balances, and purchase history',
            icon: User,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-customers-page')),
        },
        {
            id: 'staff',
            title: 'Staff Administration',
            desc: 'Manage biller accounts and permissions',
            icon: Users,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
        },
        {
            id: 'history',
            title: 'Sales History',
            desc: 'Review past transactions and reports',
            icon: TrendingUp,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
        },
    ];

    return (
        <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
            {/* Header */}
            <div className="px-8 py-5 border-b border-border bg-card relative z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                            Welcome back, <span className="text-primary">{shopName || 'Admin'}</span>
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">₹{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Today</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}</span>
                        </div>
                        <div className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-full border", isOnline ? "bg-primary/10 border-primary/20" : "bg-destructive/10 border-destructive/20")}>
                            <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-primary animate-pulse" : "bg-destructive")} />
                            <span className={clsx("text-[10px] font-bold tracking-wider", isOnline ? "text-primary" : "text-destructive")}>{isOnline ? 'CONNECTED' : 'DISCONNECTED'}</span>
                        </div>
                        <div className="w-px h-6 bg-border mx-1" />
                        <button
                            onClick={toggleTheme}
                            className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                            title="Toggle Theme"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
                            className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                            title="Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-sm text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200"
                                title="Profile"
                            >
                                {(userName || shopName)?.[0].toUpperCase() || 'A'}
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                                        <p className="text-sm font-bold text-foreground truncate">{userName || shopName || 'Admin'}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest font-semibold flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            Owner
                                        </p>
                                    </div>
                                    <div className="p-1.5">
                                        <button
                                            onClick={() => useAuthStore.getState().logout()}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 min-h-0 p-8 grid grid-cols-3 gap-4 relative z-0 items-stretch overflow-y-auto">
                {cards.map((card) => (
                    <Card
                        key={card.id}
                        onClick={card.action}
                        className="cursor-pointer group flex flex-col text-left hover:border-primary/50 hover:bg-muted/30 transition-all duration-300"
                    >
                        <CardHeader className="flex-row items-center justify-between pb-2">
                            <div className={clsx(
                                "p-3 rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105",
                                card.bgColor, card.color
                            )}>
                                <card.icon className="w-6 h-6" />
                            </div>
                            {card.shortcut && (
                                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                                    {card.shortcut}
                                </span>
                            )}
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col pt-4">
                            <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">{card.title}</CardTitle>
                            <CardDescription className="text-sm leading-relaxed mb-6">{card.desc}</CardDescription>
                            
                            <div className="mt-auto flex items-center gap-2 text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                                <span>Open</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Footer — sync progress bar when syncing, last sync status when idle */}
            {(isSyncing || syncComplete) && syncProgress ? (
                <div className="px-6 py-2.5 border-t border-border bg-card relative z-0">
                    <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs font-medium text-foreground/80 shrink-0">
                            {syncComplete ? 'Sync Complete' : syncProgress.label}
                        </span>
                        <div className="flex-1 bg-primary/10 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${syncComplete ? 'bg-emerald-500' : 'bg-primary'}`}
                                style={{ width: `${syncComplete ? 100 : syncProgress.percent}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {syncComplete ? '100%' : `${syncProgress.percent}%`}
                        </span>
                    </div>
                    {!syncComplete && shuffledQuotes.length > 0 && (
                        <div className="text-center">
                            <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
                                &ldquo;{QUOTES[shuffledQuotes[quoteIndex]]?.text ?? QUOTES[quoteIndex].text}&rdquo;
                            </p>
                            <p className="text-[10px] text-muted-foreground/50">
                                — {QUOTES[shuffledQuotes[quoteIndex]]?.author ?? QUOTES[quoteIndex].author}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-8 py-3.5 border-t border-border bg-muted/30 relative z-0">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${lastSyncTime && Date.now() - lastSyncTime < 120000 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span>Last sync: <span className="font-medium text-foreground/70">{displayTime}</span></span>
                        </div>
                        <span className="font-medium">© {new Date().getFullYear()} Vendora</span>
                    </div>
                </div>
            )}
        </div>
    );
}
