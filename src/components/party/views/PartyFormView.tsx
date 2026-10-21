import React from 'react';
import {
  UserCircle, Tag, Phone, MapPin, FileText, Building2,
  Wallet, CreditCard, Clock, AlertCircle, Save, Loader2,
  X, Banknote, Link, Layers
} from 'lucide-react';
import clsx from 'clsx';
import { Select } from '../../ui/Select';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';

export interface PartyFormViewProps {
  handleSaveParty: () => void;
  handleFormKeyDown: any;
  partyForm: any;
  setPartyForm: React.Dispatch<React.SetStateAction<any>>;
  allCustomCategories: string[];
  isCustomCategoryNew: boolean;
  setIsCustomCategoryNew: (v: boolean) => void;
  pricingTiers: any[];
  editingParty: any;
  isSavingParty: boolean;
  editReturnView: 'list' | 'ledger';
  setEditReturnView: (v: 'list' | 'ledger') => void;
  selectedParty: any;
  setView: (v: any) => void;
  resetPartyForm: () => void;
  fieldCls: string;
}

export const PartyFormView: React.FC<PartyFormViewProps> = ({
  handleSaveParty,
  handleFormKeyDown,
  partyForm,
  setPartyForm,
  allCustomCategories,
  isCustomCategoryNew,
  setIsCustomCategoryNew,
  pricingTiers,
  editingParty,
  isSavingParty,
  editReturnView,
  setEditReturnView,
  selectedParty,
  setView,
  resetPartyForm,
  fieldCls,
}) => {
  return (
        <form onSubmit={(e) => { e.preventDefault(); handleSaveParty(); }} className="flex flex-col flex-1 min-h-0 bg-background" onKeyDown={handleFormKeyDown as unknown as React.KeyboardEventHandler<HTMLFormElement>}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4" data-enter-nav>

            {/* Section: Identity */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <UserCircle className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Party Identity</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-4">
                  {/* Party Type Selection */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-primary" />
                      Party Type <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: 'CUSTOMER', label: '🛒 Customer', desc: 'Customer Billing' },
                        { key: 'SUPPLIER', label: '📦 Supplier', desc: 'Purchase Supplier' },
                        { key: 'STAFF', label: '👥 Staff', desc: 'Staff Member' },
                        { key: 'CUSTOM', label: '🏦 Custom', desc: 'Chitty / Savings / Other' },
                      ].map(t => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setPartyForm(f => ({ ...f, party_type: t.key as any }))}
                          className={clsx(
                            "p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-95",
                            partyForm.party_type === t.key
                              ? "border-primary bg-primary/10 text-primary font-black shadow-sm"
                              : "border-border bg-background hover:bg-muted/50 text-muted-foreground font-semibold"
                          )}
                        >
                          <p className="text-xs">{t.label}</p>
                          <p className="text-[9px] opacity-75 mt-0.5">{t.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Category Selection if party_type === 'CUSTOM' */}
                  {partyForm.party_type === 'CUSTOM' && (
                    <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                      <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2">
                        Choose Custom Category <span className="text-red-500">*</span>
                      </label>

                      {/* Quick Select Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {allCustomCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setPartyForm(f => ({ ...f, custom_category: cat }));
                              setIsCustomCategoryNew(false);
                            }}
                            className={clsx(
                              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none",
                              partyForm.custom_category.toLowerCase() === cat.toLowerCase() && !isCustomCategoryNew
                                ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                                : "bg-background border-border text-foreground hover:bg-muted"
                            )}
                          >
                            {cat === 'KSEB' ? '⚡ ' : cat.includes('Chitty') || cat.includes('KSFE') ? '🏦 ' : '🏷️ '}
                            {cat}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCategoryNew(true);
                            setPartyForm(f => ({ ...f, custom_category: '' }));
                          }}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none",
                            isCustomCategoryNew
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/60 hover:bg-muted border-border text-muted-foreground"
                          )}
                        >
                          ➕ Add New Category
                        </button>
                      </div>

                      {/* Input field for custom category */}
                      {(isCustomCategoryNew || !allCustomCategories.map(c => c.toLowerCase()).includes(partyForm.custom_category.toLowerCase())) && (
                        <div>
                          <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1">
                            Type New Category Name:
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. KSEB Electricity, Partner Deposit, Water Authority"
                            value={partyForm.custom_category}
                            onChange={e => setPartyForm(f => ({ ...f, custom_category: e.target.value }))}
                            className={fieldCls}
                            autoFocus
                          />
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 font-medium">
                            This new category will be saved automatically in the system and will remain available for future selection.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajan Traders"
                      value={partyForm.name}
                      onChange={e => setPartyForm(f => ({ ...f, name: e.target.value }))}
                      className={fieldCls}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Phone number"
                          value={partyForm.phone}
                          onChange={e => setPartyForm(f => ({ ...f, phone: e.target.value }))}
                          className={clsx(fieldCls, 'pl-9')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">GSTIN</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="GSTIN (optional)"
                          value={partyForm.gstin}
                          onChange={e => setPartyForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                          className={clsx(fieldCls, 'pl-9 font-mono tracking-wider')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Link className="w-3.5 h-3.5" /> Nafid Connect Code
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="e.g. NF-8924K"
                          value={partyForm.connect_code || ''}
                          onChange={e => setPartyForm(f => ({ ...f, connect_code: e.target.value.toUpperCase() }))}
                          className={clsx(fieldCls, 'uppercase font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col h-full">
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    Address
                  </label>
                  <div className="relative flex-1 flex flex-col min-h-0">
                    <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
                    <textarea
                      placeholder="Optional address, door number, street, city or PIN"
                      value={partyForm.address}
                      onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))}
                      className={clsx(fieldCls, 'pl-9 resize-none flex-1 w-full min-h-[160px] leading-relaxed')}
                    />
                  </div>
                </div>
              </div>
              {/* ── Commercial & Credit Configuration ── */}
              <div className="mt-5 pt-5 border-t border-border/70 space-y-5">
                {/* Section Header */}
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    Commercial & Credit Configuration
                  </span>
                </div>

                {/* Pricing Tier & Credit Limit Side-by-Side Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Default Pricing Tier Card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col justify-between">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-violet-500" />
                        Default Pricing Tier
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-2.5">
                        Applied automatically when billing items to this customer.
                      </p>
                    </div>
                    {pricingTiers.length > 0 ? (
                      <Select
                        value={partyForm.pricing_tier_id}
                        onChange={v => setPartyForm(f => ({ ...f, pricing_tier_id: v }))}
                        options={[
                          { value: '', label: 'Standard MRP (Default)' },
                          ...pricingTiers
                            .filter(t => (t.is_active === 1 || t.is_active === true || t.is_active === '1') && !t.is_deleted)
                            .map(t => ({ value: t.pricing_tier_id, label: t.name })),
                        ]}
                        triggerClassName="rounded-xl h-[42px] w-full bg-background"
                      />
                    ) : (
                      <div className="p-2.5 bg-background border border-border/80 rounded-xl text-xs text-muted-foreground">
                        Standard MRP (Configure custom tiers in <span className="font-semibold text-foreground">Settings &gt; Pricing Tiers</span>).
                      </div>
                    )}
                  </div>

                  {/* Credit Limit Card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                          Credit Limit (₹)
                        </label>
                        <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                          {Number(partyForm.credit_limit) > 0 ? `Max ₹${Number(partyForm.credit_limit).toLocaleString('en-IN')}` : 'No Limit'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2.5">
                        Maximum outstanding credit balance allowed.
                      </p>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00 (No Limit)"
                        value={partyForm.credit_limit}
                        onChange={e => setPartyForm(f => ({ ...f, credit_limit: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 bg-background no-spinners h-[42px] font-mono font-bold')}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Dedicated Credit Period Box ── */}
                <div className={clsx(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  partyForm.credit_period_enabled
                    ? "bg-card border-indigo-500/30 shadow-xs"
                    : "bg-muted/15 border-border/60"
                )}>
                  {/* Credit Period Header & Toggle */}
                  <div className="p-4.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        partyForm.credit_period_enabled
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-muted text-muted-foreground"
                      )}>
                        <Clock className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-foreground tracking-tight">Credit Period Management</span>
                          {partyForm.credit_period_enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                              {partyForm.credit_period_days || 30} Days
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Enforce payment deadlines independently of credit limits. Overdue credit bills can restrict new credit purchases.
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                      <input
                        type="checkbox"
                        checked={partyForm.credit_period_enabled}
                        onChange={e => setPartyForm(f => ({ ...f, credit_period_enabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
                    </label>
                  </div>

                  {/* Expanded Settings */}
                  {partyForm.credit_period_enabled && (
                    <div className="px-5 pb-5 pt-3 border-t border-border/60 space-y-4.5 animate-in fade-in-50 duration-200">
                      {/* Duration Configuration */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            Credit Duration (Days)
                          </label>
                          <span className="text-xs font-mono font-extrabold text-primary">
                            {partyForm.credit_period_days || 30} Days Grace Period
                          </span>
                        </div>

                        {/* Combined Preset Pills & Input Group */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/70 shrink-0">
                            {[15, 30, 45, 50, 60].map(days => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => setPartyForm(f => ({ ...f, credit_period_days: String(days) }))}
                                className={clsx(
                                  "px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer select-none active:scale-95",
                                  String(partyForm.credit_period_days) === String(days)
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                                )}
                              >
                                {days}d
                              </button>
                            ))}
                          </div>

                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Custom days (e.g. 30)"
                              value={partyForm.credit_period_days}
                              onChange={e => setPartyForm(f => ({ ...f, credit_period_days: e.target.value }))}
                              onWheel={e => (e.target as HTMLInputElement).blur()}
                              className={clsx(fieldCls, 'h-[40px] no-spinners text-xs font-bold pr-16')}
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                              Days
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Calculation Basis Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Calculation Basis
                        </label>
                        <select
                          value={partyForm.credit_period_basis}
                          onChange={e => setPartyForm(f => ({ ...f, credit_period_basis: e.target.value }))}
                          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all shadow-xs cursor-pointer"
                        >
                          <option value="BILL_BASED">Option A: Bill-Based (Payment due date calculated separately from each bill date)</option>
                          <option value="OLDEST_UNPAID">Option B: Oldest Unpaid Bill (Due date counted from oldest unsettled bill)</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Calculates each credit bill's deadline individually and tracks overdue status via FIFO settlement.
                        </p>
                      </div>

                      {/* Expiry Restriction Policy Selection */}
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          When Credit Period Expires
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPartyForm(f => ({ ...f, restrict_on_credit_expiry: true }))}
                            className={clsx(
                              "p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-3",
                              partyForm.restrict_on_credit_expiry
                                ? "border-rose-500 bg-rose-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">🚫</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", partyForm.restrict_on_credit_expiry ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                                Restrict Further Credit
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                Blocks new credit sales if any previous bill is overdue. Cash/Card/UPI transactions remain fully open.
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPartyForm(f => ({ ...f, restrict_on_credit_expiry: false }))}
                            className={clsx(
                              "p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-98 flex items-start gap-3",
                              !partyForm.restrict_on_credit_expiry
                                ? "border-emerald-500 bg-emerald-500/10 shadow-xs"
                                : "border-border/80 bg-background hover:bg-muted/30"
                            )}
                          >
                            <span className="text-base leading-none mt-0.5">✅</span>
                            <div className="min-w-0">
                              <p className={clsx("text-xs font-black", !partyForm.restrict_on_credit_expiry ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                Allow Further Credit
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                Permits further credit sales even past due date, subject to available credit limit.
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Info Banner */}
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                        <span className="text-sm shrink-0">💡</span>
                        <p className="leading-relaxed">
                          <strong>Independent Control:</strong> Credit Period functions independently of Credit Limit. A customer may have plenty of available limit but will still be restricted from credit purchases if past bills remain unpaid.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
            {!editingParty && (
              <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Opening Balance</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Balance Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['RECEIVABLE', 'PAYABLE'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setPartyForm(f => ({ ...f, balance_type: t }))}
                          className={clsx(
                            'py-3 px-3 rounded-xl border-2 text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer text-center',
                            partyForm.balance_type === t
                              ? t === 'RECEIVABLE'
                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {t === 'RECEIVABLE' ? '↑ Receivable' : '↓ Payable'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2 leading-snug">
                      {partyForm.balance_type === 'RECEIVABLE'
                        ? '🔴 Party owes you this amount'
                        : '🟢 You owe the party this amount'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Opening Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={partyForm.opening_balance}
                        onChange={e => setPartyForm(f => ({ ...f, opening_balance: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className={clsx(fieldCls, 'pl-8 no-spinners')}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2">
                      {partyForm.balance_type === 'RECEIVABLE'
                        ? 'Will add to the balance (+)'
                        : 'Will subtract from the balance (-)'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Section: Notes */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-blue-500">{editingParty ? '2' : '3'}. Notes</span>
              </div>
              <textarea
                placeholder="Internal notes about this party (optional)"
                rows={3}
                value={partyForm.notes}
                onChange={e => setPartyForm(f => ({ ...f, notes: e.target.value }))}
                className={clsx(fieldCls, 'resize-none')}
              />
            </section>

            {/* Section: WhatsApp Alerts */}
            <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <WhatsAppIcon className="w-4 h-4 text-emerald-500 fill-current" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {editingParty ? '3' : '4'}. WhatsApp Alerts
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/80 hover:bg-muted/50 transition-colors">
                <div className="space-y-0.5 pr-3">
                  <span className="text-xs font-bold text-foreground block">
                    Enable WhatsApp Transaction Alerts for this Party
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-relaxed">
                    When active, ledger transactions recorded for this party will send an automated text message showing Opening Balance, Paid/Received Amount, and Balance.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={partyForm.whatsapp_alerts_enabled}
                    onChange={e => setPartyForm(f => ({ ...f, whatsapp_alerts_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                </label>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (editReturnView === 'ledger' && selectedParty) {
                    setView('ledger');
                  } else {
                    setView('list');
                  }
                  resetPartyForm();
                  setEditReturnView('list');
                }}
                className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-enter-submit
                disabled={isSavingParty}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSavingParty ? 'Saving…' : editingParty ? 'Update Party' : 'Create Party'}
              </button>
            </div>
          </div>
        </form>
  );
};
