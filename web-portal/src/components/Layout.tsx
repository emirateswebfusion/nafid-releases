import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Users, Store, BookOpen, Gift, Settings2 } from 'lucide-react';
import clsx from 'clsx';

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  const links = [
    { to: '/dashboard', label: 'Sales', icon: LayoutDashboard },
    { to: '/parties', label: 'Parties', icon: BookOpen },
    { to: '/staff', label: 'Staff', icon: Users },
    { to: '/customers', label: 'Customers', icon: Gift },
    { to: '/loyalty', label: 'Loyalty', icon: Settings2 },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 font-bold text-primary">
          <Store className="w-5 h-5" />
          <span>Vendora Portal</span>
        </div>
        <button onClick={logout} className="p-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-5 h-5" />
        </button>
      </header>
      
      <main className="flex-1 overflow-y-auto min-h-0 p-4 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      <nav className="flex justify-around items-center border-t border-border bg-card pb-safe pt-2 px-2">
        {links.map(link => {
          const active = location.pathname.startsWith(link.to);
          return (
            <Link 
              key={link.to} 
              to={link.to}
              className={clsx(
                "flex flex-col items-center p-2 rounded-lg flex-1 min-w-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <link.icon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
