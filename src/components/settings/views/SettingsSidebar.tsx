import { useFeatureFlagsStore } from '../../../config/featureFlags';
import { useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, Search, X } from 'lucide-react';
import { SETTINGS_GROUPS, sectionMatchesSearch, type SettingsSection } from '../settingsSections';
import { getStoreCountry } from '../../../utils/localization/storeProfile';

export interface SettingsSidebarProps {
  activeSection: string;
  isAdmin: boolean;
  onSelect: (id: string) => void;
}

/** Grouped settings navigation with a search box; a horizontal picker on narrow screens. */
export function SettingsSidebar({ activeSection, isAdmin, onSelect }: SettingsSidebarProps) {
  const [query, setQuery] = useState('');
  const flags = useFeatureFlagsStore(s => s.flags);
  const country = getStoreCountry();
  const visible = (item: SettingsSection) => (!item.feature || !!flags?.[item.feature]) && (!item.ownerOnly || isAdmin) && (!item.countries || item.countries.includes(country)) && sectionMatchesSearch(item, query);
  const groups = SETTINGS_GROUPS
    .map(group => ({ ...group, items: group.items.filter(visible) }))
    .filter(group => group.items.length > 0);

  const searchBox = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search settings..."
        aria-label="Search settings"
        className="w-full pl-8 pr-8 py-2 bg-background border border-border/80 rounded-xl text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button type="button" onClick={() => setQuery('')} title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
  const noResults = groups.length === 0 && (
    <p className="px-3 py-2 text-[11px] text-muted-foreground">No settings match &quot;{query}&quot;.</p>
  );

  return (
    <>
      <aside className="w-56 lg:w-64 shrink-0 bg-muted/30 border-r border-border overflow-y-auto hidden md:block">
        <div className="sticky top-0 z-10 px-3.5 pt-4 pb-2 bg-muted/30 backdrop-blur-sm">{searchBox}</div>
        <nav className="pb-4 pt-2 px-3.5 space-y-5">
          {noResults}
          {groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.category} className="space-y-1">
                <div className="flex items-center gap-2 px-3 py-1 mb-1 select-none">
                  <GroupIcon className="w-3.5 h-3.5 text-muted-foreground/45" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{group.category}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer text-left border-l-2 group',
                          isActive
                            ? 'bg-gradient-to-r from-primary/10 to-primary/[0.01] text-primary border-primary shadow-sm font-extrabold'
                            : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 border-transparent'
                        )}
                      >
                        <ItemIcon className={clsx('w-4 h-4 shrink-0 transition-all duration-200', isActive ? 'text-primary scale-110' : 'text-muted-foreground/50 group-hover:text-foreground group-hover:scale-105')} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.ownerOnly && (
                          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-bold rounded-lg border border-amber-500/20 shrink-0">OWNER</span>
                        )}
                        {isActive && <ChevronRight className="w-3 h-3 text-primary/60 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="md:hidden shrink-0 border-b border-border bg-muted/20">
        <div className="px-2 pt-2">{searchBox}</div>
        <div className="flex gap-1.5 p-2 whitespace-nowrap overflow-x-auto">
          {noResults}
          {groups.flatMap(g => g.items).map((item) => {
            const ItemIcon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button key={item.id} type="button" onClick={() => onSelect(item.id)}
                className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer border shrink-0 active:scale-95',
                  isActive ? 'bg-primary/10 text-primary border-primary/20 shadow-sm' : 'bg-card text-muted-foreground/80 border-border/60 hover:text-foreground hover:bg-muted'
                )}>
                <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
