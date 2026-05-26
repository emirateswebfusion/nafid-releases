import { ShoppingBag, Users, Receipt, LayoutDashboard, Settings, Package, ArrowRight, LogOut, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useThemeStore } from '../store/themeStore';
import clsx from 'clsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { Button } from './ui/Button';

export function OwnerDashboard() {
    const { shopName } = useAuthStore();
    const { setRole } = useCartStore();
    const { isDarkMode, toggleTheme } = useThemeStore();

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
            icon: Receipt,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
        },
        {
            id: 'settings',
            title: 'Settings',
            desc: 'Configure hardware, domain, and check updates',
            icon: Settings,
            color: 'text-muted-foreground',
            bgColor: 'bg-muted',
            action: () => window.dispatchEvent(new CustomEvent('open-settings-manager')),
        }
    ];

    return (
        <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-end relative z-10 border-b border-border bg-card">
                <div>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <LayoutDashboard className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Control Center</span>
                    </div>
                    <h1 className="text-4xl font-black text-foreground tracking-tight">
                        Welcome back, <span className="text-primary">{shopName || 'Admin'}</span>
                    </h1>
                    <p className="text-muted-foreground mt-2">Manage your shop operations and staff from one place.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 bg-muted p-4 rounded-xl border border-border">
                        <div className="text-right">
                            <p className="text-xs font-bold text-muted-foreground uppercase">Current Session</p>
                            <p className="text-sm font-bold text-foreground">Owner Mode</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground shadow-sm">
                            {shopName?.[0].toUpperCase() || 'A'}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-10 w-10 rounded-xl text-foreground hover:bg-muted"
                        title="Toggle Theme"
                    >
                        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => useAuthStore.getState().logout()}
                        className="h-10 w-10 rounded-xl text-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                        title="Logout"
                    >
                        <LogOut className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 p-8 grid grid-cols-5 gap-4 relative z-10 items-stretch overflow-hidden">
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
                                <span>Open Tool</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Footer Stats Placeholder */}
            <div className="p-8 border-t border-border bg-card relative z-10">
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
