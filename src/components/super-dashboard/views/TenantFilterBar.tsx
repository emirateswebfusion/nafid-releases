import { Search, RefreshCw, Plus, Filter, ArrowUpDown } from 'lucide-react';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import type { TenantAdmin } from '../superDashboardTypes';
import type { SuperDashboardState } from '../hooks/useSuperDashboardState';

export interface TenantFilterBarProps {
  checkAllHealth: (tenantList: TenantAdmin[]) => Promise<void>;
  handleOpenCreateModal: () => void;
  sd: SuperDashboardState;
}

/** Search, domain / status filters, sort, health check and add tenant actions. */
export function TenantFilterBar({
  checkAllHealth, handleOpenCreateModal, sd,
}: TenantFilterBarProps) {
  const { admins, checkingAll, domainFilter, loading, searchQuery, setDomainFilter, setSearchQuery, setSortBy, setStatusFilter, setWhatsappModalOpen, sortBy, statusFilter } = sd;
  return (
    <section className="bg-card border border-border p-4 rounded-xl mb-6 space-y-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tenant registries by name, email, host, ID..."
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Actions group */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={() => checkAllHealth(admins)}
            disabled={checkingAll || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-xs font-semibold text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingAll ? 'animate-spin text-amber-500' : ''}`} />
            {checkingAll ? 'Checking Pools...' : 'Sweep DB Health'}
          </button>
          
          <button
            onClick={() => setWhatsappModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
            title="Manage Super Admin WhatsApp Device for Customer App OTPs"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            WhatsApp OTP Device
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 dark:text-zinc-950 font-bold rounded-lg shadow-lg shadow-amber-500/10 transition cursor-pointer text-xs"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            Provision New Store
          </button>
        </div>
      </div>

      {/* Filtering Drawer */}
      <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Filter by:</span>
        </div>

        {/* Domain filter */}
        <div className="flex items-center gap-1.5">
          <span>Domain:</span>
          <select
            className="bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
          >
            <option value="ALL">All Domains</option>
            <option value="GENERAL">General Retail</option>
            <option value="JEWELRY">Jewelry Retail</option>
            <option value="HARDWARE">Hardware & Tools</option>
            <option value="GROCERY">Grocery Stores</option>
          </select>
        </div>

        {/* Connection filter */}
        <div className="flex items-center gap-1.5">
          <span>DB Connection:</span>
          <select
            className="bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Connections</option>
            <option value="CONNECTED">Connected / Healthy</option>
            <option value="UNREACHABLE">Unreachable</option>
            <option value="CHECKING">Ping / checking</option>
          </select>
        </div>

        {/* Sort order */}
        <div className="ml-auto flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Sort:</span>
          <select
            className="bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'alphabetical')}
          >
            <option value="newest">Newest Created</option>
            <option value="oldest">Oldest Created</option>
            <option value="alphabetical">Alphabetical (A-Z)</option>
          </select>
        </div>
      </div>
    </section>
  );
}
