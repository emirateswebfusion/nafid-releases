import { useState, useRef, useEffect, useCallback } from 'react';
import { ShoppingCart, Banknote, Package, Tags, BadgePercent, BarChart3, FileText, Receipt, ShieldCheck, Shield, Undo2, Trash2, Handshake, Wallet, UserCheck, Users, Boxes, TrendingUp, Settings, LogOut, Sun, Moon, ArrowRight, Landmark, LayoutGrid, Grid3x3, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import { useFeatureFlagsStore, cashierPageTitle, isAiAssistantAvailable, type FeatureFlags, type FeatureKey } from '../featureFlags';
import { hasPermission, isAdminRole, formatRoleName } from '../utils/permissions';
import clsx from 'clsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { DigitalClock } from './DigitalClock';

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
    const { shopName, userName, lastSyncTime, setLastSyncTime, tenantId, role, permissions, isCloudSyncPaused } = useAuthStore();
    const { setRole } = useCartStore();
    const { theme, toggleTheme } = useThemeStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [displayTime, setDisplayTime] = useState('...');
    const [totalSales, setTotalSales] = useState(0);
    const [invoiceCount, setInvoiceCount] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const [activeRoute, setActiveRoute] = useState<'LAN' | 'CLOUD' | 'NONE' | null>(null);
    const [syncMode, setSyncMode] = useState<'CLOUD' | 'LAN' | 'HYBRID'>('CLOUD');
    const [enableScrap, setEnableScrap] = useState(false);
    const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();
    const [gridMode, setGridMode] = useState<'2COL' | '3COL'>('2COL');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!window.electronAPI || !tenantId) return;
        window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'network_sync_config' }).then((cfg: any) => {
            if (cfg && cfg.syncMode) setSyncMode(cfg.syncMode);
        }).catch(() => {});
    }, [tenantId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!window.electronAPI || !tenantId) return;
        loadFlags(tenantId);
    }, [tenantId, loadFlags]);

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
        if (!window.electronAPI) return;

        if (window.electronAPI.onSyncCycleComplete) {
            window.electronAPI.onSyncCycleComplete(() => {
                const t = Date.now();
                setLastSyncTime(t);
                setDisplayTime('just now');
                loadStats();
            });
        }

        if (window.electronAPI.onSyncDataUpdated) {
            window.electronAPI.onSyncDataUpdated(() => {
                loadStats();
            });
        }

        const interval = setInterval(() => {
            loadStats();
        }, 30000);

        return () => clearInterval(interval);
    }, [setLastSyncTime, loadStats]);

    useEffect(() => {
        if (window.electronAPI?.onOnlineStatus) {
            window.electronAPI.onOnlineStatus((online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') => {
                setIsOnline(online);
                if (route) setActiveRoute(route);
            });
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

    useKeyboardShortcuts({
        'F1': () => {
            window.dispatchEvent(new CustomEvent('open-billing-page'));
        }
    });

    const cards = [
        ...(isAiAssistantAvailable ? [{
            id: 'ai-assistant',
            title: 'AI Business Assistant',
            desc: 'Chat to analyze sales, inventory, customer credit & insights',
            icon: Sparkles,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-ai-assistant')),
            shortcut: 'AI',
        }] : []),
        {
            id: 'billing',
            title: 'Billing',
            desc: 'Create new invoices and manage sales',
            icon: ShoppingCart,
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-billing-page')),
            shortcut: 'F1',
            perm: 'sales.create'
        },
        {
            id: 'cashier',
            title: cashierPageTitle(featureFlags),
            desc: 'Settle pending bills, manage cash drawer, and day-end closing',
            icon: Banknote,
            color: 'text-yellow-500',
            bgColor: 'bg-yellow-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-cashier-settlement')),
            perm: 'cash_register.view'
        },
        {
            id: 'inventory',
            title: 'Inventory Manager',
            desc: 'Manage products, stock levels, and pricing',
            icon: Package,
            color: 'text-cyan-500',
            bgColor: 'bg-cyan-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-inventory-manager')),
            perm: 'products.view'
        },
        {
            id: 'grades',
            title: 'Categories & Grades',
            desc: 'Configure category classifications, grade rules, purchase price, and MRP',
            icon: Tags,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-settings-grades')),
            perm: 'products.view'
        },
        {
            id: 'pricing-tiers',
            title: 'Pricing Tiers',
            desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices',
            icon: BadgePercent,
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-settings-pricing-tiers')),
            perm: 'combos.view'
        },
        {
            id: 'financial-report',
            title: 'Financial Report',
            desc: 'View P&L statement, revenue breakdown, GST liability & profit margins',
            icon: Landmark,
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-financial-report')),
            perm: 'reports.financial'
        },
        {
            id: 'stock-print',
            title: 'Stock Report',
            desc: 'Print A4 stock reports with PDF export',
            icon: BarChart3,
            color: 'text-teal-500',
            bgColor: 'bg-teal-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-stock-report')),
            perm: 'reports.view'
        },
        {
            id: 'quotations',
            title: 'Quotations',
            desc: 'Create and manage A4 quotations',
            icon: FileText,
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-quotation-manager')),
            perm: 'quotations.view'
        },
        {
            id: 'purchase-bills',
            title: 'Purchase Bills',
            desc: 'Record and manage GST purchase bills',
            icon: Receipt,
            color: 'text-pink-500',
            bgColor: 'bg-pink-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-purchase-bills')),
            perm: 'purchases.view'
        },
        {
            id: 'warranties',
            title: 'Warranty Bills',
            desc: 'Register and print warranty certificates',
            icon: ShieldCheck,
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-warranty-manager')),
            perm: 'warranties.view'
        },
        {
            id: 'returns',
            title: 'Returns',
            desc: 'View returned items, manage refunds, and restore stock',
            icon: Undo2,
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-returns-manager')),
            perm: 'sales.refund'
        },
        ...(enableScrap ? [{
            id: 'scrap',
            title: 'Scrap Management',
            desc: 'Track scrap purchases, sales & profit',
            icon: Trash2,
            color: 'text-orange-500',
            bgColor: 'bg-orange-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-scrap-manager')),
            perm: 'scrap.view'
        }] : []),
        {
            id: 'parties',
            title: 'Ledger',
            desc: 'Track credit parties, balances, and payments',
            icon: Handshake,
            color: 'text-rose-500',
            bgColor: 'bg-rose-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-parties-manager')),
            perm: 'customers.view'
        },
        {
            id: 'payments',
            title: 'Payment Methods',
            desc: 'Manage bank accounts, cards & UPI ids for receiving payments',
            icon: Wallet,
            color: 'text-teal-500',
            bgColor: 'bg-teal-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-payments-page')),
            perm: 'settings.view'
        },
        {
            id: 'customers',
            title: 'Customers',
            desc: 'Browse customer list, points balances, and purchase history',
            icon: UserCheck,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-customers-page')),
            perm: 'customers.view'
        },
        {
            id: 'staff',
            title: 'Staff Administration',
            desc: 'Manage biller accounts and permissions',
            icon: Users,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
            perm: 'users.view'
        },
        {
            id: 'combo-offers',
            title: 'Combo Offers',
            desc: 'Create and manage product bundles and combo offers',
            icon: Boxes,
            color: 'text-purple-500',
            bgColor: 'bg-purple-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-combo-manager')),
            perm: 'combos.view'
        },
        {
            id: 'history',
            title: 'Sales History',
            desc: 'Review past transactions and reports',
            icon: TrendingUp,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
            perm: 'sales.view'
        },
    ];

    const FEATURE_BY_CARD: Record<string, FeatureKey> = {
        'ai-assistant': 'ai_assistant',
        billing: 'billing',
        cashier: 'cash_settlement',
        inventory: 'inventory',
        'combo-offers': 'combo_offers',
        grades: 'categories_grades',
        'pricing-tiers': 'pricing_tiers',
        'stock-print': 'stock_report',
        quotations: 'quotations',
        'purchase-bills': 'purchase_bills',
        warranties: 'warranties',
        returns: 'returns',
        scrap: 'scrap',
        parties: 'parties',
        payments: 'payments',
        customers: 'customers',
        staff: 'staff',
        history: 'sales_history',
    };

    const visibleCards = cards.filter(c => {
        // 1. Feature Flag check
        if (featureFlags) {
            if (c.id === 'cashier' && !featureFlags.cash_settlement) return false;
            const f = FEATURE_BY_CARD[c.id];
            if (f && !featureFlags[f]) return false;
        }

        // 2. Permission check
        if (c.perm && !hasPermission({ role, permissions }, c.perm)) {
            return false;
        }

        return true;
    });

    const canOpenSettings = hasPermission({ role, permissions }, 'settings.view');

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-background">
            {/* ═══════════════════════════════════════════════════
                HEADER
            ═══════════════════════════════════════════════════ */}
            <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-bold text-foreground truncate">
                                Welcome back, <span className="text-primary">{userName || shopName || (isAdminRole(role) ? 'Admin' : 'Staff')}</span>
                            </h1>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                            {new Date().toLocaleDateString('en-US', { timeZone: getStoreTimezone(), weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="hidden sm:flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">₹{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Today</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{invoiceCount} {invoiceCount === 1 ? 'Invoice' : 'Invoices'}</span>
                            </div>
                            <div
                                className={clsx(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors",
                                    isCloudSyncPaused
                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/20 active:scale-[0.97]"
                                        : (!isOnline || activeRoute === 'NONE')
                                        ? "bg-destructive/10 border-destructive/20 text-destructive"
                                        : isSyncing
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                )}
                                onClick={isCloudSyncPaused ? () => window.dispatchEvent(new Event('open-session-expired-modal')) : undefined}
                                title={isCloudSyncPaused ? "Click to login and resume cloud sync" : undefined}
                            >
                                <span className={clsx(
                                    "w-1.5 h-1.5 rounded-full",
                                    isCloudSyncPaused
                                        ? "bg-amber-500 animate-pulse"
                                        : (!isOnline || activeRoute === 'NONE')
                                        ? "bg-destructive"
                                        : isSyncing
                                        ? "bg-blue-500 animate-spin"
                                        : "bg-emerald-500 animate-pulse"
                                )} />
                                <span className="text-[10px] font-bold tracking-wider">
                                    {isCloudSyncPaused
                                        ? 'Re-Login Needed'
                                        : (!isOnline || activeRoute === 'NONE')
                                        ? 'Offline'
                                        : isSyncing
                                        ? 'Syncing...'
                                        : (activeRoute === 'LAN' ? 'Wi-Fi Synced' : 'Cloud Synced')}
                                </span>
                            </div>
                            <span className="w-px h-5 bg-border/40" />
                        </div>
                        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
                            <button
                                onClick={() => setGridMode('2COL')}
                                className={clsx("p-1.5 rounded-lg transition-all cursor-pointer", gridMode === '2COL' ? "bg-card text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground")}
                                title="2-Column Grid View"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setGridMode('3COL')}
                                className={clsx("p-1.5 rounded-lg transition-all cursor-pointer", gridMode === '3COL' ? "bg-card text-primary shadow-sm border border-border" : "text-muted-foreground hover:text-foreground")}
                                title="Compact Grid View"
                            >
                                <Grid3x3 className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                            title="Toggle Theme"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        {canOpenSettings && (
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
                                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                                title="Settings"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                        )}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center font-bold text-xs text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer"
                                title="Profile"
                            >
                                {(userName || shopName)?.[0].toUpperCase() || 'A'}
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                                        <p className="text-sm font-bold text-foreground truncate">{userName || shopName || (isAdminRole(role) ? 'Admin' : 'Staff')}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest font-semibold flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            {formatRoleName(role)}
                                        </p>
                                    </div>
                                    <div className="p-1.5">
                                        <button
                                            onClick={() => useAuthStore.getState().logout()}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left cursor-pointer"
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
            </header>

            {/* Grid Content */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-8 pb-20 md:pb-8">
                {visibleCards.length === 0 ? (
                    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 shadow-sm border border-amber-500/20">
                            <Shield className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground mb-2">No Modules Assigned</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Your staff account does not currently have access to any dashboard modules. Please contact your store administrator to assign permissions for your account.
                        </p>
                    </div>
                ) : (
                    <div className={clsx(
                        "grid gap-4 items-stretch transition-all duration-300",
                        gridMode === '2COL' && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                        gridMode === '3COL' && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
                    )}>
                        {visibleCards.map((card) => (
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
                )}
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
                        <DigitalClock variant="footer" />
                    </div>
                </div>
            )}
        </div>
    );
}

