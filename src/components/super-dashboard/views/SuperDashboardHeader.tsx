import { Database, Sun, Moon, LogOut } from 'lucide-react';

export interface SuperDashboardHeaderProps {
  handleLogout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  userName: string | null;
}

/** Header bar: title, signed-in user, theme toggle and logout. */
export function SuperDashboardHeader({
  handleLogout, theme, toggleTheme, userName,
}: SuperDashboardHeaderProps) {
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shadow-inner shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground truncate">Nafid Console</span>
              <span className="text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">Super Admin</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">Registry Database & Schema Manager</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-bold text-foreground block leading-tight">{userName || 'Platform Admin'}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Platform Admin</span>
          </div>
          <span className="w-px h-5 bg-border/40 hidden sm:block" />
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-200 active:scale-95 cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>
    </header>
  );
}
