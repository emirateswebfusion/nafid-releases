import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/** A settings card with an icon header, matching the existing settings-tab card styling. */
export function SettingsCard({ icon: Icon, title, subtitle, children, actions }: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-black text-primary uppercase tracking-widest block">{title}</span>
          {subtitle && <p className="text-[11px] text-muted-foreground/75 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** An on/off setting backed by a real checkbox (styled as a switch), for forms that read `checked` and use
 * `<fieldset disabled>`. The label holds only `label`, so it stays the input's accessible name. */
export function SwitchField({ id, label, description, checked, onChange, disabled }: {
  id: string;
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 p-4 bg-muted/30 border border-border rounded-2xl transition-all duration-300', disabled ? 'opacity-60' : 'hover:border-primary/20')}>
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="text-xs font-bold text-foreground cursor-pointer select-none">{label}</label>
        {description && <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
          className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10" />
        <span aria-hidden className="w-11 h-6 rounded-full bg-muted-foreground/20 transition-all duration-300 peer-checked:bg-primary peer-checked:shadow-[0_2px_8px_rgba(79,70,229,0.3)] peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20" />
        <span aria-hidden className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 peer-checked:translate-x-5" />
      </span>
    </div>
  );
}

/** Save button + status line for a block of settings that saves on its own (outside the main Save Changes). */
export function SectionSaveBar({ label, onSave, saving, dirty, disabled, status }: {
  label: string;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  disabled?: boolean;
  status?: { text: string; type: 'success' | 'error' } | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-1 border-t border-border">
      <p role="status" className={clsx('text-xs font-semibold min-h-4',
        status?.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : status?.type === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
        {status?.text || (dirty ? 'You have unsaved changes on this page.' : 'These options are saved with the button on the right.')}
      </p>
      <button type="button" onClick={onSave} disabled={disabled || saving}
        className={clsx('flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-black rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border shrink-0',
          dirty ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25' : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground')}>
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}

/** One on/off setting: label, description and a switch. */
export function ToggleRow({ label, description, checked, onToggle, title }: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
      <div className="flex-1 min-w-0">
        <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={onToggle}>{label}</label>
        {description && <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        title={title ?? (checked ? 'Enabled' : 'Disabled')}
        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', checked ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
      >
        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', checked ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
