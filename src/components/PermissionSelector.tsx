import { useState } from 'react';
import { Check, CheckSquare, Square, ChevronDown, ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import { PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from '../utils/permissions';
import clsx from 'clsx';

interface PermissionSelectorProps {
  selectedPermissions?: string[];
  onChange: (permissions: string[]) => void;
}

const STANDARD_STAFF_PERMISSIONS = [
  'sales.view',
  'sales.create',
  'sales.create_gst',
  'sales.create_estimate',
  'sales.discount',
  'sales.reprint',
  'products.view',
  'products.view_gst',
  'products.view_estimate',
  'customers.view',
  'customers.create',
  'cash_register.view',
  'cash_register.cash_in',
  'quotations.view',
];

export function PermissionSelector({ selectedPermissions = [], onChange }: PermissionSelectorProps) {
  const safeSelected = Array.isArray(selectedPermissions) ? selectedPermissions : [];

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    PERMISSION_GROUPS.forEach(g => {
      initial[g.id] = true;
    });
    return initial;
  });

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleToggleSingle = (key: string) => {
    if (safeSelected.includes(key)) {
      onChange(safeSelected.filter(k => k !== key));
    } else {
      onChange([...safeSelected, key]);
    }
  };

  const handleToggleGroup = (groupId: string) => {
    const group = PERMISSION_GROUPS.find(g => g.id === groupId);
    if (!group) return;

    const groupKeys = group.permissions.map(p => p.key);
    const allSelected = groupKeys.every(k => safeSelected.includes(k));

    if (allSelected) {
      onChange(safeSelected.filter(k => !groupKeys.includes(k)));
    } else {
      const union = Array.from(new Set([...safeSelected, ...groupKeys]));
      onChange(union);
    }
  };

  const handleSelectAll = () => {
    onChange([...ALL_PERMISSION_KEYS]);
  };

  const handleApplyStandard = () => {
    onChange([...STANDARD_STAFF_PERMISSIONS]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const totalCount = ALL_PERMISSION_KEYS.length;
  const selectedCount = safeSelected.length;
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;
  const isStandardSelected = 
    selectedCount === STANDARD_STAFF_PERMISSIONS.length && 
    STANDARD_STAFF_PERMISSIONS.every(k => safeSelected.includes(k));
  const isNoneSelected = selectedCount === 0;

  return (
    <div className="space-y-3">
      {/* ── UNIFIED TOOLBAR & PRESETS ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-card border border-border/60 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-extrabold text-foreground">Permissions Matrix</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {selectedCount} / {totalCount} selected
          </span>
        </div>

        {/* Merged Preset Toolbar */}
        <div className="flex items-center gap-1 p-0.5 bg-muted/40 border border-border/60 rounded-lg">
          <button
            type="button"
            onClick={handleSelectAll}
            className={clsx(
              'px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer flex items-center gap-1.5',
              isAllSelected
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            )}
          >
            <CheckSquare className="w-3 h-3" />
            Select All
          </button>

          <button
            type="button"
            onClick={handleApplyStandard}
            className={clsx(
              'px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer flex items-center gap-1.5',
              isStandardSelected
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            )}
          >
            <Zap className="w-3 h-3 text-amber-500" />
            Standard
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className={clsx(
              'px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer flex items-center gap-1.5',
              isNoneSelected
                ? 'bg-rose-500 text-white shadow-2xs'
                : 'text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10'
            )}
          >
            <Square className="w-3 h-3" />
            Clear All
          </button>
        </div>
      </div>

      {/* ── GROUPS LIST ── */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {PERMISSION_GROUPS.map(group => {
          const isExpanded = expandedGroups[group.id];
          const groupKeys = group.permissions.map(p => p.key);
          const selectedInGroup = groupKeys.filter(k => safeSelected.includes(k));
          const isAllGroupSelected = selectedInGroup.length === groupKeys.length;
          const isSomeGroupSelected = selectedInGroup.length > 0 && !isAllGroupSelected;

          return (
            <div key={group.id} className="border border-border/50 rounded-xl bg-card overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2 bg-muted/20 cursor-pointer select-none hover:bg-muted/40 transition-colors"
                onClick={() => toggleGroupExpand(group.id)}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupExpand(group.id);
                    }}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleGroup(group.id);
                    }}
                    className={clsx(
                      'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                      isAllGroupSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : isSomeGroupSelected
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'border-input hover:border-primary'
                    )}
                  >
                    {isAllGroupSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    {isSomeGroupSelected && <span className="w-2 h-0.5 bg-primary rounded-full" />}
                  </button>

                  <div>
                    <span className="text-xs font-extrabold text-foreground">{group.name}</span>
                    <span className="ml-2 text-[10px] font-bold text-muted-foreground">
                      ({selectedInGroup.length}/{groupKeys.length})
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline">{group.description}</span>
              </div>

              {isExpanded && (
                <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-border/30 bg-background/50">
                  {group.permissions.map(perm => {
                    const isChecked = safeSelected.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={clsx(
                          'flex items-start gap-2.5 p-2 rounded-lg border text-left cursor-pointer transition-all',
                          isChecked
                            ? 'bg-primary/5 border-primary/40 text-foreground'
                            : 'bg-card border-border/40 hover:border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSingle(perm.key)}
                          className="sr-only"
                        />
                        <div
                          className={clsx(
                            'mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                            isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                          )}
                        >
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={clsx('text-[11px] font-bold leading-tight mb-0.5', isChecked ? 'text-primary' : 'text-foreground')}>
                            {perm.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{perm.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
