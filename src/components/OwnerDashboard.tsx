import { useState, useRef, useEffect, useCallback } from 'react';
import {
    ShoppingCart, Banknote, Package, Tags, BarChart3, FileText, Receipt,
    ShieldCheck, Shield, Undo2, Trash2, Handshake, Wallet, UserCheck, Users, Boxes,
    TrendingUp, Settings, LogOut, Sun, Moon, Landmark, LayoutGrid, Grid3x3,
    Bot, Globe, Megaphone, SlidersHorizontal, GripVertical, ChevronLeft, ChevronRight,
    RotateCcw, Check, Layers, BookOpen, ClipboardList, RefreshCcw, UserCog, Archive, ArrowRight
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import { useFeatureFlagsStore, cashierPageTitle, isAiAssistantAvailable, type FeatureKey } from '../featureFlags';
import { hasPermission, isAdminRole, formatRoleName } from '../utils/permissions';
import clsx from 'clsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { getStoreTimezone } from '../utils/timezoneHelper';
import { DigitalClock } from './DigitalClock';
import { useDashboardCardsStore } from '../store/dashboardCardsStore';
import { DashboardCardCustomizer } from './DashboardCardCustomizer';
import { RestoreDefaultCardsDialog } from './RestoreDefaultCardsDialog';
import { Modal } from './ui/Modal';

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
    const { shopName, userName, lastSyncTime, setLastSyncTime, tenantId, userId, role, permissions, isCloudSyncPaused } = useAuthStore();
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
    const [showCustomizeModal, setShowCustomizeModal] = useState(false);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const [draggedDashboardCardId, setDraggedDashboardCardId] = useState<string | null>(null);
    const [dragOverDashboardCardId, setDragOverDashboardCardId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const {
        cardOrder,
        loadCardOrder,
        setCardOrder,
        isEditMode,
        setIsEditMode,
        resetToDefault
    } = useDashboardCardsStore();

    useEffect(() => {
        loadCardOrder(tenantId, userId, role);
    }, [tenantId, userId, role, loadCardOrder]);

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
            id: 'ecommerce',
            title: 'E-Commerce Portal',
            desc: 'FusionCart online vendor portal, catalog sync & orders',
            icon: Globe,
            color: 'text-sky-500',
            bgColor: 'bg-sky-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-ecommerce-portal')),
            perm: 'products.view',
            badge: 'NEW'
        },
        {
            id: 'advertisements',
            title: 'Advertisements & Promotions',
            desc: 'Create Instagram-style promotional cards & track customer views',
            icon: Megaphone,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-ads-manager')),
            badge: 'NEW'
        },
        ...(isAiAssistantAvailable ? [{
            id: 'ai-assistant',
            title: 'AI Business Assistant',
            desc: 'Chat to analyze sales, inventory, customer credit & insights',
            icon: Bot,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-ai-assistant')),
            badge: 'NEW',
        }] : []),
        {
            id: 'grades',
            title: 'Categories & Grades',
            desc: 'Configure category classifications, grade rules, purchase price, and MRP',
            icon: Tags,
            color: 'text-fuchsia-500',
            bgColor: 'bg-fuchsia-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-settings-grades')),
            perm: 'products.view'
        },
        {
            id: 'pricing-tiers',
            title: 'Pricing Tiers',
            desc: 'Create dynamic price tiers (Retail, Wholesale…) and set per-tier prices',
            icon: Layers,
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
            color: 'text-green-600',
            bgColor: 'bg-green-600/10',
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
            icon: ClipboardList,
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
            color: 'text-lime-600',
            bgColor: 'bg-lime-600/10',
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
            icon: Archive,
            color: 'text-stone-500',
            bgColor: 'bg-stone-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-scrap-manager')),
            perm: 'scrap.view'
        }] : []),
        {
            id: 'parties',
            title: 'Ledger',
            desc: 'Track credit parties, balances, and payments',
            icon: BookOpen,
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
            color: 'text-teal-600',
            bgColor: 'bg-teal-600/10',
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
            icon: UserCog,
            color: 'text-slate-500',
            bgColor: 'bg-slate-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
            perm: 'users.view'
        },
        {
            id: 'combo-offers',
            title: 'Combo Offers',
            desc: 'Create and manage product bundles and combo offers',
            icon: Boxes,
            color: 'text-violet-600',
            bgColor: 'bg-violet-600/10',
            action: () => window.dispatchEvent(new CustomEvent('open-combo-manager')),
            perm: 'combos.view'
        },
        {
            id: 'history',
            title: 'Sales History',
            desc: 'Review past transactions and reports',
            icon: TrendingUp,
            color: 'text-amber-600',
            bgColor: 'bg-amber-600/10',
            action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
            perm: 'sales.view'
        },
        {
            id: 'recycle-bin',
            title: 'Recycle Bin',
            desc: 'Recover deleted bills, inventory items & contacts',
            icon: RefreshCcw,
            color: 'text-red-500',
            bgColor: 'bg-red-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-recycle-bin')),
            perm: 'sales.view'
        },
    ];

    const FEATURE_BY_CARD: Record<string, FeatureKey> = {
        'ai-assistant': 'ai_assistant',
        billing: 'billing',
        cashier: 'cash_settlement',
        inventory: 'inventory',
        ecommerce: 'ecommerce',
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
        'recycle-bin': 'recycle_bin',
    };

    // Sort cards according to user's custom sequence
    const sortedCards = [...cards].sort((a, b) => {
        const indexA = cardOrder.indexOf(a.id);
        const indexB = cardOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    const visibleCards = sortedCards.filter(c => {
        // 1. Feature Flag check
        if (c.id === 'ai-assistant') {
            if (!isAiAssistantAvailable || (featureFlags && featureFlags.ai_assistant === false)) return false;
        } else if (featureFlags) {
            if (c.id === 'cashier' && !featureFlags.cash_settlement) return false;
            if (c.id === 'recycle-bin') {
                if (featureFlags.recycle_bin === false) return false;
            } else {
                const f = FEATURE_BY_CARD[c.id];
                if (f && !featureFlags[f]) return false;
            }
        }

        // 2. Permission check
        if (c.perm && !hasPermission({ role, permissions }, c.perm)) {
            return false;
        }

        return true;
    });

    const visibleCardIds = visibleCards.map(c => c.id);

    const handleShiftCard = (cardId: string, direction: 'prev' | 'next') => {
        const visIdx = visibleCardIds.indexOf(cardId);
        if (visIdx === -1) return;
        const targetVisIdx = direction === 'prev' ? visIdx - 1 : visIdx + 1;
        if (targetVisIdx < 0 || targetVisIdx >= visibleCardIds.length) return;
        const targetId = visibleCardIds[targetVisIdx];

        const current = [...cardOrder];
        const sourceIdx = current.indexOf(cardId);
        const targetIdx = current.indexOf(targetId);
        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [moved] = current.splice(sourceIdx, 1);
            current.splice(targetIdx, 0, moved);
            setCardOrder(current, tenantId, userId, role);
        }
    };

    const handleDashboardCardDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedDashboardCardId(id);
    };

    const handleDashboardCardDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverDashboardCardId !== id) {
            setDragOverDashboardCardId(id);
        }
    };

    const handleDashboardCardDragEnd = () => {
        setDraggedDashboardCardId(null);
        setDragOverDashboardCardId(null);
    };

    const handleDashboardCardDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain') || draggedDashboardCardId;
        if (!sourceId || sourceId === targetId) {
            setDraggedDashboardCardId(null);
            setDragOverDashboardCardId(null);
            return;
        }

        const current = [...cardOrder];
        const sourceIdx = current.indexOf(sourceId);
        const targetIdx = current.indexOf(targetId);

        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [moved] = current.splice(sourceIdx, 1);
            current.splice(targetIdx, 0, moved);
            setCardOrder(current, tenantId, userId, role);
        }

        setDraggedDashboardCardId(null);
        setDragOverDashboardCardId(null);
    };

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

                        {/* Reorder / Customizer Header Action */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer shadow-xs border",
                                    isEditMode
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "bg-muted/60 hover:bg-muted text-foreground border-border"
                                )}
                                title={isEditMode ? "Exit Reorder Mode" : "Enable Reorder Cards Mode"}
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">{isEditMode ? 'Done Reordering' : 'Reorder Cards'}</span>
                            </button>
                        </div>

                        {/* Grid Mode Selector */}
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

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                            title="Toggle Theme"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>

                        {/* Settings Button */}
                        {canOpenSettings && (
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('open-settings-manager'))}
                                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
                                title="Settings"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                        )}

                        {/* Profile Menu */}
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
                                    <div className="p-1.5 space-y-1">
                                        <button
                                            onClick={() => {
                                                setMenuOpen(false);
                                                setShowCustomizeModal(true);
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted rounded-lg transition-colors text-left cursor-pointer"
                                        >
                                            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                                            <span>Customize Cards Order</span>
                                        </button>
                                        <button
                                            onClick={() => useAuthStore.getState().logout()}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left cursor-pointer"
                                        >
                                            <LogOut className="w-3.5 h-3.5" />
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
                {/* Reorder Mode Banner */}
                {isEditMode && (
                    <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary text-primary-foreground shadow-xs">
                                <GripVertical className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-foreground flex items-center gap-2">
                                    <span>Card Reorder Mode is Active</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary font-black uppercase tracking-wider">
                                        Live
                                    </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Drag cards directly or use the ◀ ▶ buttons on each card to shift their position. Order is automatically saved.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setShowCustomizeModal(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-card hover:bg-muted border border-border rounded-xl text-foreground cursor-pointer shadow-xs transition-colors"
                            >
                                Open List View
                            </button>
                            <button
                                onClick={() => setShowRestoreDialog(true)}
                                className="px-3 py-1.5 text-xs font-bold bg-card hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-xs transition-colors"
                                title="Reset to factory default sequence (Billing first, Cashier second...)"
                            >
                                <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                                Reset
                            </button>
                            <button
                                onClick={() => setIsEditMode(false)}
                                className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-xs hover:opacity-95 cursor-pointer transition-opacity"
                            >
                                <Check className="w-3.5 h-3.5 inline mr-1" />
                                Done
                            </button>
                        </div>
                    </div>
                )}

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
                        {visibleCards.map((card, cardIndex) => {
                            const isDragged = draggedDashboardCardId === card.id;
                            const isDragOver = dragOverDashboardCardId === card.id && !isDragged;
                            const isFirst = cardIndex === 0;
                            const isLast = cardIndex === visibleCards.length - 1;

                            return (
                                <Card
                                    key={card.id}
                                    draggable={isEditMode}
                                    onDragStart={isEditMode ? (e) => handleDashboardCardDragStart(e, card.id) : undefined}
                                    onDragOver={isEditMode ? (e) => handleDashboardCardDragOver(e, card.id) : undefined}
                                    onDragEnd={isEditMode ? handleDashboardCardDragEnd : undefined}
                                    onDrop={isEditMode ? (e) => handleDashboardCardDrop(e, card.id) : undefined}
                                    onClick={isEditMode ? undefined : card.action}
                                    className={clsx(
                                        "flex flex-col text-left transition-all duration-300",
                                        isEditMode
                                            ? "cursor-grab active:cursor-grabbing border-dashed border-primary/40 bg-card hover:border-primary select-none"
                                            : "cursor-pointer group hover:border-primary/50 hover:bg-muted/30",
                                        isDragged && "opacity-40 scale-[0.98] border-primary ring-2 ring-primary/40",
                                        isDragOver && "ring-2 ring-primary border-primary bg-primary/10"
                                    )}
                                >
                                    <CardHeader className="flex-row items-center justify-between pb-2">
                                        <div className="flex items-center gap-2">
                                            {isEditMode && (
                                                <div className="flex items-center gap-1 mr-1 text-muted-foreground">
                                                    <GripVertical className="w-4 h-4 shrink-0" />
                                                    <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-mono font-bold text-foreground border border-border">
                                                        #{cardIndex + 1}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={clsx(
                                                "p-3 rounded-xl shadow-sm transition-transform duration-300",
                                                !isEditMode && "group-hover:scale-105",
                                                card.bgColor, card.color
                                            )}>
                                                <card.icon className="w-6 h-6" />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isEditMode ? (
                                                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShiftCard(card.id, 'prev')}
                                                        disabled={isFirst}
                                                        className={clsx(
                                                            "p-1 rounded transition-colors cursor-pointer",
                                                            isFirst ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-card text-foreground active:scale-95"
                                                        )}
                                                        title="Move 1 step left/earlier"
                                                    >
                                                        <ChevronLeft className="w-4 h-4" />
                                                    </button>
                                                    <span className="text-[10px] font-bold text-muted-foreground px-1">
                                                        {cardIndex + 1}/{visibleCards.length}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShiftCard(card.id, 'next')}
                                                        disabled={isLast}
                                                        className={clsx(
                                                            "p-1 rounded transition-colors cursor-pointer",
                                                            isLast ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-card text-foreground active:scale-95"
                                                        )}
                                                        title="Move 1 step right/later"
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {(card as any).badge && (
                                                        (card as any).badge === 'NEW' ? (
                                                            <span className="animate-new-badge relative inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-gradient-to-r from-emerald-500/15 via-teal-500/20 to-emerald-500/15 border border-emerald-500/40 dark:border-emerald-400/40 px-2.5 py-0.5 rounded-full select-none">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                                </span>
                                                                <span className="font-extrabold tracking-wider">NEW</span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full shadow-2xs">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                {(card as any).badge}
                                                            </span>
                                                        )
                                                    )}
                                                    {card.shortcut && (
                                                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                                                            {card.shortcut}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </CardHeader>

                                    <CardContent className="flex-1 flex flex-col pt-4">
                                        <CardTitle className={clsx("text-xl mb-2 transition-colors", !isEditMode && "group-hover:text-primary")}>
                                            {card.title}
                                        </CardTitle>
                                        <CardDescription className="text-sm leading-relaxed mb-6">
                                            {card.desc}
                                        </CardDescription>

                                        <div className="mt-auto flex items-center justify-between text-xs font-bold text-muted-foreground">
                                            {isEditMode ? (
                                                <span className="text-[11px] text-primary flex items-center gap-1">
                                                    <GripVertical className="w-3.5 h-3.5" /> Drag or use ◀ ▶ arrows to move
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2 group-hover:text-primary transition-colors">
                                                    <span>Open</span>
                                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Customize Cards List Modal */}
            <Modal
                isOpen={showCustomizeModal}
                onClose={() => setShowCustomizeModal(false)}
                title="Customize Dashboard Cards"
                className="max-w-2xl"
            >
                <DashboardCardCustomizer
                    onClose={() => setShowCustomizeModal(false)}
                    allowedCardIds={visibleCardIds}
                />
            </Modal>

            {/* Custom Restore Defaults Confirmation Dialog */}
            <RestoreDefaultCardsDialog
                isOpen={showRestoreDialog}
                onClose={() => setShowRestoreDialog(false)}
            />

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
