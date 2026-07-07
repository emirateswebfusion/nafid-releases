import * as React from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

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
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ value, onChange, options, placeholder = 'Select...', className, disabled = false, searchable = false, size = 'default', triggerClassName }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const containerRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

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
    }, [open, searchable]);

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
      }
    };

    return (
      <div ref={containerRef} className={twMerge('relative', className)} onKeyDown={handleKeyDown}>
        <button
          type="button"
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
            'shrink-0 text-muted-foreground transition-transform',
            size === 'default' ? 'w-4 h-4' : 'w-3.5 h-3.5',
            open && 'rotate-180'
          )} />
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            {searchable && (
              <div className="p-1.5 border-b border-border">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-background border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">No results found</div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={clsx(
                      'w-full text-left px-2 py-1.5 text-sm transition-colors cursor-pointer',
                      option.value === value
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    {option.label}
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
