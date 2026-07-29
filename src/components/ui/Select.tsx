import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  size?: 'default' | 'sm' | 'xs';
  triggerClassName?: string;
  renderOption?: (option: SelectOption, isSelected: boolean) => React.ReactNode;
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ value, onChange, options, placeholder = 'Select...', className, disabled = false, searchable = false, size = 'default', triggerClassName, renderOption }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [focusedIndex, setFocusedIndex] = React.useState(-1);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);

    const selectedOption = options.find(o => o.value === value);

    React.useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
          setSearch('');
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    React.useEffect(() => {
      if (open && searchable) {
        searchInputRef.current?.focus();
      }
      if (open) {
        const idx = filtered.findIndex(o => o.value === value);
        setFocusedIndex(idx >= 0 ? idx : -1);
      } else {
        setFocusedIndex(-1);
      }
    }, [open, searchable]);

    React.useEffect(() => {
      if (open && listRef.current) {
        const items = listRef.current.querySelectorAll<HTMLElement>('[data-option-index]');
        items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
      }
    }, [focusedIndex, open]);

    const filtered = searchable && search.trim()
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options;

    const handleSelect = (option: SelectOption) => {
      onChange(option.value);
      setOpen(false);
      setSearch('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
        return;
      }
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          handleSelect(filtered[focusedIndex]);
        } else {
          setOpen(false);
        }
        setTimeout(() => {
          const trigger = containerRef.current?.querySelector('button');
          if (trigger && document.activeElement !== trigger) trigger.focus();
          const focusable = document.querySelectorAll<HTMLElement>(
            '[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
          );
          const idx = Array.from(focusable).indexOf(trigger);
          if (idx >= 0 && idx < focusable.length - 1) {
            focusable[idx + 1]?.focus();
          }
        }, 0);
      }
    };

    return (
      <div ref={containerRef} className={twMerge('relative', className)} onKeyDown={handleKeyDown}>
        <button
          type="button"
          data-select-trigger
          disabled={disabled}
          onClick={() => !disabled && setOpen(prev => !prev)}
          className={twMerge(
            clsx(
              'w-full bg-background border border-input rounded-md text-left flex items-center justify-between gap-2 transition-all shadow-sm',
              {
                'h-10 px-3 py-2 text-sm': size === 'default',
                'h-8 px-2.5 py-1 text-xs': size === 'sm',
                'h-7 px-2 py-0.5 text-xs': size === 'xs',
              },
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'cursor-pointer',
              open && 'ring-2 ring-ring ring-offset-2'
            ),
            triggerClassName
          )}
        >
          <span className={clsx('truncate', !selectedOption && 'text-muted-foreground')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={clsx(
            'shrink-0 text-current opacity-70 transition-transform duration-200',
            size === 'default' ? 'w-4 h-4' : 'w-3.5 h-3.5',
            open && 'rotate-180'
          )} />
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {searchable && (
              <div className="p-1.5 border-b border-border">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setFocusedIndex(0); }}
                  placeholder="Search..."
                  className="w-full bg-background border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <div ref={listRef} className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground text-center">No results found</div>
              ) : (
                filtered.map((option, index) => (
                  <button
                    key={option.value}
                    data-option-index={index}
                    type="button"
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer flex items-center gap-2',
                      focusedIndex === index && 'bg-muted',
                      option.value === value && !renderOption && 'bg-primary/5 text-primary font-medium',
                      option.value !== value && 'text-foreground'
                    )}
                  >
                    {renderOption ? (
                      renderOption(option, option.value === value)
                    ) : (
                      <>
                        <span className={clsx('flex-1 truncate', option.value === value && 'font-medium')}>
                          {option.label}
                        </span>
                        {option.value === value && (
                          <Check className="w-4 h-4 shrink-0 text-primary" />
                        )}
                      </>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
