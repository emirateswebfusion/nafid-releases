import { ShoppingBag, Users, Receipt, LayoutDashboard, Settings, Package, ArrowRight, Store, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import clsx from 'clsx';

export function OwnerDashboard() {
  const { shopName } = useAuthStore();
  const { setRole } = useCartStore();

  const cards = [
    {
      id: 'billing',
      title: 'POS Billing',
      desc: 'Create new invoices and manage sales',
      icon: ShoppingBag,
      color: 'bg-blue-500',
      action: () => setRole('CASHIER'),
      shortcut: 'F1'
    },
    {
      id: 'inventory',
      title: 'Inventory Manager',
      desc: 'Manage products, stock levels, and pricing',
      icon: Package,
      color: 'bg-purple-500',
      action: () => window.dispatchEvent(new CustomEvent('open-inventory-manager')),
    },
    {
      id: 'staff',
      title: 'Staff Administration',
      desc: 'Manage cashier accounts and permissions',
      icon: Users,
      color: 'bg-amber-500',
      action: () => window.dispatchEvent(new CustomEvent('open-staff-manager')),
    },
    {
      id: 'history',
      title: 'Sales History',
      desc: 'Review past transactions and reports',
      icon: Receipt,
      color: 'bg-emerald-500',
      action: () => window.dispatchEvent(new CustomEvent('open-sales-history')),
    },
    {
      id: 'settings',
      title: 'Hardware Setup',
      desc: 'Configure printers and peripheral devices',
      icon: Settings,
      color: 'bg-neutral-700',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-manager')),
    }
  ];

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-600/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />

      {/* Header */}
      <div className="p-8 pb-4 flex justify-between items-end relative z-10">
        <div>
          <div className="flex items-center gap-2 text-neutral-500 mb-2">
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Control Center</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">{shopName || 'Admin'}</span>
          </h1>
          <p className="text-neutral-500 mt-2">Manage your shop operations and staff from one place.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800">
             <div className="text-right">
               <p className="text-xs font-bold text-neutral-500 uppercase">Current Session</p>
               <p className="text-sm font-bold text-white">Owner Mode</p>
             </div>
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
               {shopName?.[0].toUpperCase() || 'A'}
             </div>
          </div>
          <button 
            onClick={() => useAuthStore.getState().logout()}
            className="p-4 bg-neutral-900 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 rounded-2xl border border-neutral-800 hover:border-red-500/50 transition-all group"
            title="Logout"
          >
            <LogOut className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 p-8 grid grid-cols-5 gap-4 relative z-10 items-stretch">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={card.action}
            className="group relative flex flex-col text-left p-6 bg-neutral-900 border border-neutral-800 rounded-3xl hover:border-neutral-700 hover:bg-neutral-800/50 transition-all duration-300 overflow-hidden"
          >
            {/* Glow effect */}
            <div className={clsx(
              "absolute top-0 right-0 w-32 h-32 blur-3xl opacity-0 group-hover:opacity-20 transition-opacity",
              card.color.replace('bg-', 'bg-')
            )} />

            <div className="flex justify-between items-start mb-6">
              <div className={clsx(
                "p-3.5 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform duration-500",
                card.color
              )}>
                <card.icon className="w-6 h-6" />
              </div>
              {card.shortcut && (
                <span className="text-[10px] font-black text-neutral-600 bg-neutral-950 px-2.5 py-1 rounded-full border border-neutral-800">
                  {card.shortcut}
                </span>
              )}
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:translate-x-1 transition-transform">{card.title}</h3>
            <p className="text-neutral-500 text-sm leading-relaxed">{card.desc}</p>

            <div className="mt-auto pt-6 flex items-center gap-2 text-xs font-bold text-neutral-400 group-hover:text-white transition-colors">
              <span>Open Tool</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ))}
      </div>

      {/* Footer Stats Placeholder */}
      <div className="p-8 border-t border-neutral-900 bg-neutral-900/20 relative z-10">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-1">Total Sales (Today)</span>
            <span className="text-xl font-black text-white">₹0.00</span>
          </div>
          <div className="w-[1px] h-8 bg-neutral-800" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-1">Active Invoices</span>
            <span className="text-xl font-black text-white">0</span>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-bold border border-emerald-500/20 animate-pulse">
             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
             LIVE SYNC ACTIVE
          </div>
        </div>
      </div>
    </div>
  );
}
