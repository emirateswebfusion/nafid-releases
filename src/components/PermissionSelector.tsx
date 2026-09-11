import { useState } from 'react';
import { Check, CheckSquare, Square, ChevronDown, ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import { PERMISSION_GROUPS, ALL_PERMISSION_KEYS } from '../utils/permissions';
import clsx from 'clsx';

interface PermissionSelectorProps {
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
}

export function PermissionSelector({ selectedPermissions, onChange }: PermissionSelectorProps) {
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
    if (selectedPermissions.includes(key)) {
      onChange(selectedPermissions.filter(k => k !== key));
    } else {
      onChange([...selectedPermissions, key]);
    }
  };

  const handleToggleGroup = (groupId: string) => {
    const group = PERMISSION_GROUPS.find(g => g.id === groupId);
    if (!group) return;

    const groupKeys = group.permissions.map(p => p.key);
    const allSelected = groupKeys.every(k => selectedPermissions.includes(k));

    if (allSelected) {
      onChange(selectedPermissions.filter(k => !groupKeys.includes(k)));
    } else {
      const union = Array.from(new Set([...selectedPermissions, ...groupKeys]));
      onChange(union);
    }
  };

  const handleSelectAll = () => {
    onChange([...ALL_PERMISSION_KEYS]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const totalCount = ALL_PERMISSION_KEYS.length;
  const selectedCount = selectedPermissions.length;

  return (
    <div className="space-y-4 border border-border/60 rounded-xl bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Staff Permissions Configuration</h4>
            <p className="text-xs text-muted-foreground">
              Selected <span className="font-semibold text-primary">{selectedCount}</span> of {totalCount} permissions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
          >
            <CheckSquare className="w-3.5 h-3.5 text-primary" />
            Select All
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Square className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {PERMISSION_GROUPS.map(group => {
          const isExpanded = expandedGroups[group.id];
          const groupKeys = group.permissions.map(p => p.key);
          const selectedInGroup = groupKeys.filter(k => selectedPermissions.includes(k));
          const isAllGroupSelected = selectedInGroup.length === groupKeys.length;
          const isSomeGroupSelected = selectedInGroup.length > 0 && !isAllGroupSelected;

          return (
            <div key={group.id} className="border border-border/40 rounded-lg bg-muted/20 overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2.5 bg-muted/40 cursor-pointer select-none hover:bg-muted/60 transition-colors"
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
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
                    <span className="text-xs font-bold text-foreground">{group.name}</span>
                    <span className="ml-2 text-[10px] font-medium text-muted-foreground">
                      ({selectedInGroup.length}/{groupKeys.length})
                    </span>
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground hidden sm:inline">{group.description}</span>
              </div>

              {isExpanded && (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-card border-t border-border/30">
                  {group.permissions.map(perm => {
                    const isChecked = selectedPermissions.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={clsx(
                          'flex items-start gap-2.5 p-2 rounded-md border text-left cursor-pointer transition-all',
                          isChecked
                            ? 'bg-primary/5 border-primary/40 text-foreground'
                            : 'bg-muted/10 border-border/30 hover:border-border text-muted-foreground hover:text-foreground'
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
                            'mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                            isChecked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                          )}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={clsx('text-xs font-semibold leading-none mb-1', isChecked ? 'text-primary' : 'text-foreground')}>
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
