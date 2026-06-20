import { useState, useRef, useEffect } from 'react';
import { ShoppingBag, Users, TrendingUp, Settings, Package, ArrowRight, LogOut, Sun, Moon, Handshake, FileText, Trash2, Printer, Shield } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';

export function OwnerDashboard() {
    const { shopName } = useAuthStore();
    const { setRole } = useCartStore();
    const { theme, toggleTheme } = useThemeStore();
    const [menuOpen, setMenuOpen] = useState(false);
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

    const cards = [
        {
            id: 'billing',
            title: 'POS Billing',
            desc: 'Create new invoices and manage sales',
            icon: ShoppingBag,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => setRole('CASHIER'),
            shortcut: 'F1'
        },
        {
            id: 'inventory',
            title: 'Inventory Manager',
            desc: 'Manage products, stock levels, and pricing',
            icon: Package,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-inventory-manager')),
        },
        {
            id: 'stock-print',
            title: 'Stock Report',
            desc: 'Print A4 stock reports with PDF export',
            icon: Printer,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-stock-print')),
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
            id: 'warranties',
            title: 'Warranty Bills',
            desc: 'Register and print warranty certificates',
            icon: Shield,
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-warranty-manager')),
        },
        {
            id: 'scrap',
            title: 'Scrap Management',
            desc: 'Track scrap purchases, sales & profit',
            icon: Trash2,
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            action: () => window.dispatchEvent(new CustomEvent('open-scrap-manager')),
        },
        {
            id: 'parties',
            title: 'Parties / Credit',
            desc: 'Track credit parties, balances, and payments',
            icon: Handshake,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-parties-manager')),
        },
        {
            id: 'staff',
            title: 'Staff Administration',
            desc: 'Manage cashier accounts and permissions',
            icon: Users,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
        },
        {
            id: 'history',
            title: 'Sales History',
            desc: 'Review past transactions and reports',
            icon: TrendingUp,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
        },
    ];

    return (
        <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-end relative z-10 border-b border-border bg-card">
                <div>
                    <h1 className="text-4xl font-black text-foreground tracking-tight">
                        Welcome back, <span className="text-primary">{shopName || 'Admin'}</span>
                    </h1>
                    <p className="text-muted-foreground mt-2">Manage your shop operations and staff from one place.</p>
                </div>

                <div className="flex items-center gap-4 relative" ref={menuRef}>
                    <button 
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl text-primary-foreground shadow-sm hover:scale-105 transition-transform"
                    >
                        {shopName?.[0].toUpperCase() || 'A'}
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-[110%] w-56 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                            <div className="p-4 border-b border-border bg-muted/30">
                                <p className="text-sm font-bold text-foreground truncate">{shopName || 'Admin'}</p>
                                <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest font-bold">Owner</p>
                            </div>
                            <div className="p-2 space-y-1">
                                <button 
                                    onClick={() => { toggleTheme(); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors text-left"
                                >
                                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                    Toggle Theme
                                </button>
                                <button 
                                    onClick={() => { window.dispatchEvent(new CustomEvent('open-settings-manager')); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors text-left"
                                >
                                    <Settings className="w-4 h-4" />
                                    Settings
                                </button>
                                <button 
                                    onClick={() => useAuthStore.getState().logout()}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
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

            {/* Footer Stats Placeholder */}
            <div className="p-8 border-t border-border bg-card relative z-0">
                <div className="flex items-center gap-8">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Sales (Today)</span>
                        <span className="text-xl font-black text-foreground">₹0.00</span>
                    </div>
                    <div className="w-[1px] h-8 bg-border" />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Active Invoices</span>
                        <span className="text-xl font-black text-foreground">0</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold border border-primary/20">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                        LIVE SYNC ACTIVE
                    </div>
                </div>
            </div>
        </div>
    );
}
