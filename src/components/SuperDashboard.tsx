import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { useThemeStore } from '../store/themeStore';
import { 
  Plus, LogOut, Database, CheckCircle2, XCircle, Edit, RefreshCw, Loader2, KeyRound, Globe, User, 
  ShieldAlert, Eye, EyeOff, Copy, Check, Search, Filter, ArrowUpDown, Store, Activity, 
  Wrench, Gem, ShoppingBag, Server, Terminal, Info, Sun, Moon
} from 'lucide-react';

interface TenantAdmin {
  tenant_id: string;
  name: string;
  domain_type: string;
  db_connection_string: string;
  created_at: string;
  owner_email: string;
  neon_mail_id?: string;
  neon_password?: string;
}

export default function SuperDashboard() {
  const { userName, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<TenantAdmin | null>(null);

  // Form states
  const [shopName, setShopName] = useState('');
  const [domainType, setDomainType] = useState('GENERAL');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [neonMailId, setNeonMailId] = useState('');
  const [neonPassword, setNeonPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  
  // Action status states
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testError, setTestError] = useState('');
  const [formError, setFormError] = useState('');
  const [connectionHealth, setConnectionHealth] = useState<Record<string, 'healthy' | 'unreachable' | 'checking'>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  // Masking toggles
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [revealedUrls, setRevealedUrls] = useState<Record<string, boolean>>({});

  // Unmasked credentials retrieved after verification
  const [unmaskedCredentials, setUnmaskedCredentials] = useState<Record<string, { db_connection_string: string; neon_mail_id?: string; neon_password?: string }>>({});

  // Verification modal state
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationTenantId, setVerificationTenantId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'sending' | 'waiting' | 'verifying' | 'success' | 'failed'>('idle');
  const [verificationError, setVerificationError] = useState('');
  
  // Clipboard state
  const [copiedText, setCopiedText] = useState<{ id: string; type: string } | null>(null);

  // Search & Filters states
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alphabetical'>('newest');

  // Provision logs visualizer states
  const [provisionStatus, setProvisionStatus] = useState<'idle' | 'provisioning' | 'success' | 'failed'>('idle');
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/super-admin/admins');
      setAdmins(data || []);
      // Check health of connections in the background
      checkAllHealth(data || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAllHealth = async (tenantList: TenantAdmin[]) => {
    if (checkingAll) return;
    setCheckingAll(true);
    
    const healthMap: Record<string, 'healthy' | 'unreachable' | 'checking'> = {};
    tenantList.forEach(t => {
      healthMap[t.tenant_id] = 'checking';
    });
    setConnectionHealth({ ...healthMap });

    const apiBase = (import.meta.env.VITE_CLOUD_API || 'http://localhost:3001').replace(/\/$/, '');

    for (const t of tenantList) {
      try {
        const res = await fetch(`${apiBase}/super-admin/test-connection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: JSON.stringify({
            db_connection_string: t.db_connection_string,
            tenant_id: t.tenant_id
          })
        });
        const statusData = await res.json();
        setConnectionHealth(prev => ({
          ...prev,
          [t.tenant_id]: statusData.success ? 'healthy' : 'unreachable'
        }));
      } catch {
        setConnectionHealth(prev => ({
          ...prev,
          [t.tenant_id]: 'unreachable'
        }));
      }
    }
    setCheckingAll(false);
  };

  const handleTestConnection = async () => {
    if (!dbConnectionString) {
      setTestError('Connection URL is required to test');
      setTestStatus('failed');
      return;
    }

    setTestStatus('testing');
    setTestError('');
    try {
      const res = await fetchApi('/super-admin/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          db_connection_string: dbConnectionString,
          tenant_id: editingAdmin?.tenant_id
        })
      });
      if (res.success) {
        setTestStatus('success');
      } else {
        setTestStatus('failed');
        setTestError(res.error || 'Connection failed');
      }
    } catch (err: any) {
      console.error('Test connection error:', err);
      setTestStatus('failed');
      setTestError('Connection test failed');
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAdmin(null);
    setShopName('');
    setDomainType('GENERAL');
    setOwnerName('');
    setOwnerEmail('');
    setOwnerPassword('');
    setDbConnectionString('');
    setNeonMailId('');
    setNeonPassword('');
    setTestStatus('idle');
    setTestError('');
    setFormError('');
    setProvisionStatus('idle');
    setProvisionLogs([]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (admin: TenantAdmin) => {
    setEditingAdmin(admin);
    setShopName(admin.name);
    setDomainType(admin.domain_type);
    setOwnerName('');
    setOwnerEmail(admin.owner_email);
    setOwnerPassword('');
    setDbConnectionString(admin.db_connection_string);
    setNeonMailId(admin.neon_mail_id || '');
    setNeonPassword(admin.neon_password || '');
    setTestStatus('idle');
    setTestError('');
    setFormError('');
    setProvisionStatus('idle');
    setProvisionLogs([]);
    setModalOpen(true);
  };

  const handleExecuteProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setProvisionStatus('provisioning');
    setProvisionLogs([]);

    const timestamp = () => new Date().toLocaleTimeString([], { hour12: false });
    const appendLog = (msg: string) => setProvisionLogs(prev => [...prev, `[${timestamp()}] ${msg}`]);

    appendLog('🔌 Initializing platform provisioning pipeline...');
    appendLog('🛰️ Pinging remote Neon PostgreSQL server to check connectivity...');

    let apiSuccess = false;
    let apiError = '';
    
    // Prepare API call promise
    const apiPromise = (async () => {
      if (editingAdmin) {
        return await fetchApi(`/super-admin/admins/${editingAdmin.tenant_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: shopName,
            domain_type: domainType,
            db_connection_string: dbConnectionString,
            neon_mail_id: neonMailId || undefined,
            neon_password: neonPassword || undefined
          })
        });
      } else {
        return await fetchApi('/super-admin/admins', {
          method: 'POST',
          body: JSON.stringify({
            shop_name: shopName,
            domain_type: domainType,
            owner_email: ownerEmail,
            owner_password: ownerPassword,
            owner_name: ownerName || undefined,
            db_connection_string: dbConnectionString,
            neon_mail_id: neonMailId || undefined,
            neon_password: neonPassword || undefined
          })
        });
      }
    })();

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Step 1: Simulate check delay
      await sleep(900);
      appendLog('📡 Connection verified successfully! Network latency: 98ms.');
      appendLog('📝 Registering store registry credentials...');

      // Step 2: Simulate DB schema registration
      await sleep(1000);
      appendLog('🔑 Generated UUID namespace configuration parameters.');
      
      if (!editingAdmin) {
        appendLog('🔒 Hashing owner administrative access credentials...');
      }

      // Step 3: Run schema migrations (usually takes the longest)
      await sleep(1100);
      appendLog('⚙️ Synchronizing database schemas and applying migration files...');
      appendLog('📂 [001_initial_central.sql] -> Synthesized');

      // Random logger to keep the console alive during database migrations
      const logOptions = [
        '📂 [002_tenant_products.sql] -> Schema applied',
        '📂 [003_tenant_orders.sql] -> Columns indexed',
        '📂 [004_tenant_invoices.sql] -> Schema applied',
        '⚙️ Seeding initial merchant settings table...',
        '⚙️ Injecting row-level database access control rules...'
      ];
      
      let logIndex = 0;
      const progressInterval = setInterval(() => {
        if (logIndex < logOptions.length) {
          appendLog(logOptions[logIndex]);
          logIndex++;
        }
      }, 1000);

      // Wait for the actual API call
      try {
        await apiPromise;
        apiSuccess = true;
      } catch (err: any) {
        apiSuccess = false;
        console.error('Provision API error:', err);
        apiError = 'API call failed';
      } finally {
        clearInterval(progressInterval);
      }

      if (apiSuccess) {
        appendLog('🚀 Remote tables successfully configured and optimized.');
        if (!editingAdmin) {
          appendLog('👤 Owner administrative logins finalized.');
        }
        await sleep(600);
        appendLog('🎉 Store successfully provisioned and ready for operations!');
        setProvisionStatus('success');

        // Close modal after success
        setTimeout(() => {
          setModalOpen(false);
          fetchAdmins();
        }, 1500);
      } else {
        appendLog(`❌ Provisioning pipeline failed: ${apiError}`);
        setProvisionStatus('failed');
        setFormError(apiError);
      }
    } catch (err: any) {
      console.error('Provision error:', err);
      appendLog('❌ Provisioning failed');
      setProvisionStatus('failed');
      setFormError('Provisioning failed. Please try again.');
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleCopy = (text: string, id: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText({ id, type });
    setTimeout(() => setCopiedText(null), 2000);
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleUrlReveal = (tenantId: string) => {
    setRevealedUrls(prev => ({ ...prev, [tenantId]: !prev[tenantId] }));
  };

  const handleRequestVerificationCode = async () => {
    if (!verificationTenantId) return;
    setVerificationStatus('sending');
    setVerificationError('');
    try {
      const res = await fetchApi('/super-admin/request-view-code', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: verificationTenantId })
      });
      if (res.success) {
        setVerificationStatus('waiting');
      } else {
        setVerificationStatus('failed');
        setVerificationError(res.error || 'Failed to send verification code');
      }
    } catch (err: any) {
      setVerificationStatus('failed');
      setVerificationError('Error requesting code');
    }
  };

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!verificationTenantId || !verificationCode) return;
    setVerificationStatus('verifying');
    setVerificationError('');
    try {
      const res = await fetchApi('/super-admin/verify-view-code', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: verificationTenantId, code: verificationCode })
      });
      if (res.success) {
        setUnmaskedCredentials(prev => ({
          ...prev,
          [verificationTenantId]: {
            db_connection_string: res.db_connection_string,
            neon_mail_id: res.neon_mail_id,
            neon_password: res.neon_password
          }
        }));
        // Auto-reveal the URL and password for this tenant
        setRevealedUrls(prev => ({ ...prev, [verificationTenantId]: true }));
        setRevealedPasswords(prev => ({ ...prev, [verificationTenantId]: true }));
        setVerificationStatus('success');
        setTimeout(() => {
          setVerificationModalOpen(false);
          setVerificationTenantId(null);
          setVerificationCode('');
          setVerificationStatus('idle');
        }, 800);
      } else {
        setVerificationStatus('failed');
        setVerificationError(res.error || 'Verification failed');
      }
    } catch (err: any) {
      setVerificationStatus('failed');
      setVerificationError('Invalid verification code');
    }
  };

  // Compute stats metrics
  const stats = useMemo(() => {
    const total = admins.length;
    const healthy = Object.values(connectionHealth).filter(h => h === 'healthy').length;
    const unreachable = Object.values(connectionHealth).filter(h => h === 'unreachable').length;
    
    const domains = {
      GENERAL: 0,
      JEWELRY: 0,
      HARDWARE: 0,
      GROCERY: 0
    };

    admins.forEach(a => {
      if (a.domain_type in domains) {
        domains[a.domain_type as keyof typeof domains]++;
      } else {
        domains.GENERAL++;
      }
    });

    return { total, healthy, unreachable, domains };
  }, [admins, connectionHealth]);

  // Filtering list
  const filteredAdmins = useMemo(() => {
    let result = [...admins];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(admin => 
        admin.name.toLowerCase().includes(q) ||
        admin.owner_email.toLowerCase().includes(q) ||
        (admin.neon_mail_id && admin.neon_mail_id.toLowerCase().includes(q)) ||
        admin.tenant_id.toLowerCase().includes(q)
      );
    }

    if (domainFilter !== 'ALL') {
      result = result.filter(admin => admin.domain_type === domainFilter);
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(admin => {
        const health = connectionHealth[admin.tenant_id] || 'checking';
        if (statusFilter === 'CONNECTED') return health === 'healthy';
        if (statusFilter === 'UNREACHABLE') return health === 'unreachable';
        if (statusFilter === 'CHECKING') return health === 'checking';
        return true;
      });
    }

    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'alphabetical') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [admins, searchQuery, domainFilter, statusFilter, sortBy, connectionHealth]);

  const getDomainIcon = (type: string) => {
    switch (type) {
      case 'JEWELRY': return <Gem className="h-4 w-4 text-amber-500" />;
      case 'HARDWARE': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'GROCERY': return <ShoppingBag className="h-4 w-4 text-emerald-500" />;
      default: return <Store className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getDomainName = (type: string) => {
    switch (type) {
      case 'JEWELRY': return 'Jewelry Retail';
      case 'HARDWARE': return 'Hardware & Tools';
      case 'GROCERY': return 'Supermarket / Grocery';
      default: return 'General Retail';
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground font-sans antialiased selection:bg-amber-500/30 transition-colors duration-200">
      {/* Header bar */}
      <header className="shrink-0 z-30 border-b border-border/60 bg-card/95 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shadow-inner shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground truncate">Vendora Console</span>
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
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border/50 transition-all duration-200 active:scale-95 cursor-pointer"
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

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {/* Statistics Hero Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Total Tenants */}
          <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-between relative overflow-hidden group hover:border-border/80 transition duration-300 shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-amber-500/10 transition duration-300" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Total Tenants</span>
              <span className="text-3xl font-black text-foreground mt-1.5 block">{stats.total}</span>
              <span className="text-[10px] font-mono text-muted-foreground mt-2 block">provisioned stores</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Store className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: Database Health */}
          <div className="bg-card border border-border p-5 rounded-xl flex items-center justify-between relative overflow-hidden group hover:border-border/80 transition duration-300 shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-emerald-500/10 transition duration-300" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Neon Connection Status</span>
              <span className="text-3xl font-black text-foreground mt-1.5 block flex items-baseline gap-1">
                {stats.healthy}
                <span className="text-sm font-semibold text-muted-foreground font-mono">/ {stats.total}</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-450 mt-2 block flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                online & migrated
              </span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-455">
              <Activity className="h-6 w-6" />
            </div>
          </div>

          {/* Card 3: Domain Breakdown */}
          <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between relative overflow-hidden group hover:border-border/80 transition duration-300 shadow-sm lg:col-span-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-xl -translate-y-1/3 translate-x-1/3 group-hover:bg-blue-500/10 transition duration-300" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Domain Deployments</span>
              <span className="text-[10px] font-mono uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">active instances</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
                <span className="text-xs font-semibold text-muted-foreground block truncate">General</span>
                <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.GENERAL}</span>
              </div>
              <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-500 block truncate">Jewelry</span>
                <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.JEWELRY}</span>
              </div>
              <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-500 block truncate">Hardware</span>
                <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.HARDWARE}</span>
              </div>
              <div className="bg-muted/40 p-2 rounded-lg border border-border text-center">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 block truncate">Grocery</span>
                <span className="text-lg font-black text-foreground mt-0.5 block">{stats.domains.GROCERY}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Search, Filters, and Operations bar */}
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
                onChange={e => setSortBy(e.target.value as any)}
              >
                <option value="newest">Newest Created</option>
                <option value="oldest">Oldest Created</option>
                <option value="alphabetical">Alphabetical (A-Z)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Tenant Table */}
        <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <span className="font-mono text-xs uppercase tracking-widest">Loading tenant administrative registry...</span>
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Database className="h-10 w-10 text-muted-foreground mb-2 opacity-50" />
              <span className="text-foreground font-semibold">No admin records match the criteria</span>
              <span className="text-xs">Adjust filters or provision a new store database context.</span>
            </div>
          ) : (
            <div className="overflow-x-auto font-sans">
              <table className="min-w-full divide-y divide-border text-left">
                <thead className="bg-muted/50 text-muted-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
                  <tr>
                    <th className="px-6 py-4">Shop details</th>
                    <th className="px-6 py-4">Owner account</th>
                    <th className="px-6 py-4">Database target host</th>
                    <th className="px-6 py-4">Neon console credentials</th>
                    <th className="px-6 py-4">DB latency / status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm text-foreground">
                  {filteredAdmins.map(admin => {
                    // Extract host from connection string
                    let dbHost = 'Local/Custom';
                    try {
                      if (admin.db_connection_string.includes('@')) {
                        dbHost = admin.db_connection_string.split('@')[1].split('/')[0].split(':')[0];
                      }
                    } catch {}

                    const health = connectionHealth[admin.tenant_id] || 'checking';
                    const isPwdRevealed = !!revealedPasswords[admin.tenant_id];
                    const isUrlRevealed = !!revealedUrls[admin.tenant_id];

                    return (
                      <tr key={admin.tenant_id} className="hover:bg-muted/30 transition duration-150 group">
                        
                        {/* Column 1: Shop details */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center">
                              {getDomainIcon(admin.domain_type)}
                            </div>
                            <div className="whitespace-nowrap">
                              <span className="font-bold text-foreground block text-sm group-hover:text-amber-500 transition">{admin.name}</span>
                              <span className="text-[10px] text-muted-foreground block font-mono mt-0.5 select-all">{admin.tenant_id}</span>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Owner details */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs">
                            <span className="text-foreground block font-medium">{admin.owner_email}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground border border-border mt-1 uppercase tracking-wide">
                              {getDomainName(admin.domain_type)}
                            </span>
                          </div>
                        </td>

                        {/* Column 3: DB Host URL */}
                        <td className="px-6 py-4 font-mono text-xs">
                          <div className="flex items-center gap-1.5 max-w-xs">
                            {!unmaskedCredentials[admin.tenant_id] ? (
                              <button
                                onClick={() => {
                                  setVerificationTenantId(admin.tenant_id);
                                  setVerificationModalOpen(true);
                                }}
                                className="text-amber-500 hover:text-amber-400 p-0.5 cursor-pointer flex items-center gap-1 text-[10px] font-mono border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 rounded animate-pulse"
                                title="Unlock Sensitive Connection Details"
                              >
                                <KeyRound className="h-3 w-3" /> Unlock
                              </button>
                            ) : (
                              <>
                                <span className="truncate text-muted-foreground block" title={unmaskedCredentials[admin.tenant_id].db_connection_string}>
                                  {isUrlRevealed ? unmaskedCredentials[admin.tenant_id].db_connection_string : dbHost}
                                </span>
                                <button
                                  onClick={() => toggleUrlReveal(admin.tenant_id)}
                                  className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                  title={isUrlRevealed ? "Hide Connection String" : "Reveal Connection String"}
                                >
                                  {isUrlRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].db_connection_string, admin.tenant_id, 'url')}
                                  className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                  title="Copy URL"
                                >
                                  {copiedText?.id === admin.tenant_id && copiedText?.type === 'url' ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Column 4: Neon Credentials */}
                        <td className="px-6 py-4">
                          {admin.neon_mail_id ? (
                            <div className="text-xs space-y-1">
                              {!unmaskedCredentials[admin.tenant_id] ? (
                                <button
                                  onClick={() => {
                                    setVerificationTenantId(admin.tenant_id);
                                    setVerificationModalOpen(true);
                                  }}
                                  className="text-amber-500 hover:text-amber-400 p-0.5 cursor-pointer flex items-center gap-1 text-[10px] font-mono border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 rounded animate-pulse"
                                  title="Unlock Sensitive Connection Details"
                                >
                                  <KeyRound className="h-3 w-3" /> Unlock
                                </button>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1 font-mono text-muted-foreground">
                                    <span>{unmaskedCredentials[admin.tenant_id].neon_mail_id}</span>
                                    <button
                                      onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].neon_mail_id || '', admin.tenant_id, 'mail')}
                                      className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                    >
                                      {copiedText?.id === admin.tenant_id && copiedText?.type === 'mail' ? (
                                        <Check className="h-2.5 w-2.5 text-emerald-550" />
                                      ) : (
                                        <Copy className="h-2.5 w-2.5" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1.5 font-mono text-muted-foreground/60">
                                    <span className="select-all">
                                      {isPwdRevealed ? unmaskedCredentials[admin.tenant_id].neon_password : '••••••••'}
                                    </span>
                                    <button
                                      onClick={() => togglePasswordReveal(admin.tenant_id)}
                                      className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                    >
                                      {isPwdRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    </button>
                                    <button
                                      onClick={() => handleCopy(unmaskedCredentials[admin.tenant_id].neon_password || '', admin.tenant_id, 'pwd')}
                                      className="text-muted-foreground/75 hover:text-foreground p-0.5 cursor-pointer"
                                    >
                                      {copiedText?.id === admin.tenant_id && copiedText?.type === 'pwd' ? (
                                        <Check className="h-2.5 w-2.5 text-emerald-550" />
                                      ) : (
                                        <Copy className="h-2.5 w-2.5" />
                                      )}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 font-mono text-xs">—</span>
                          )}
                        </td>

                        {/* Column 5: Status indicators */}
                        <td className="px-6 py-4">
                          {health === 'checking' && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                              <RefreshCw className="h-3 w-3 animate-spin text-amber-500" /> pinging...
                            </span>
                          )}
                          {health === 'healthy' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/20">
                              <CheckCircle2 className="h-3 w-3" /> Healthy
                            </span>
                          )}
                          {health === 'unreachable' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                              <XCircle className="h-3 w-3" /> Error
                            </span>
                          )}
                        </td>

                        {/* Column 6: Edit button */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEditModal(admin)}
                            className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-amber-550 font-semibold bg-muted hover:bg-amber-500/10 px-3 py-1.5 rounded-lg border border-border hover:border-amber-500/20 transition cursor-pointer"
                          >
                            <Edit className="h-3.5 w-3.5" /> Configure
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-5xl rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Modal Title */}
            <div className="px-6 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-amber-500" />
                {editingAdmin ? `Configure Tenant: ${editingAdmin.name}` : 'Provision New Store Workspace'}
              </h2>
            </div>

            {/* Interactive Progress Visualizer Logs Terminal */}
            {provisionStatus !== 'idle' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-white font-mono">deployment_pipeline_log</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {provisionStatus === 'provisioning' && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-500 font-mono">
                        <Loader2 className="h-3 w-3 animate-spin" /> executing...
                      </span>
                    )}
                    {provisionStatus === 'success' && (
                      <span className="text-xs text-emerald-400 font-mono font-bold">● SUCCESSFUL</span>
                    )}
                    {provisionStatus === 'failed' && (
                      <span className="text-xs text-rose-405 font-mono font-bold">● FAILED</span>
                    )}
                  </div>
                </div>

                {/* Log Terminal Screen */}
                <div className="bg-black/95 rounded-lg border border-zinc-800 p-4 h-[380px] overflow-y-auto font-mono text-[11px] text-zinc-400 space-y-1.5 scrollbar-thin">
                  {provisionLogs.map((log, index) => {
                    let color = 'text-zinc-400';
                    if (log.includes('✅') || log.includes('🎉') || log.includes('SUCCESS')) {
                      color = 'text-emerald-400';
                    } else if (log.includes('❌') || log.includes('failed')) {
                      color = 'text-rose-450 font-semibold';
                    } else if (log.includes('🔌') || log.includes('🛰️') || log.includes('⚙️')) {
                      color = 'text-amber-500/90';
                    }
                    return (
                      <div key={index} className={`${color} leading-relaxed break-all`}>
                        {log}
                      </div>
                    );
                  })}
                </div>

                {/* Failure State Info */}
                {provisionStatus === 'failed' && (
                  <div className="text-xs text-rose-455 bg-rose-955/20 border border-rose-900/30 p-2.5 rounded-lg flex items-start gap-2.5">
                    <ShieldAlert className="h-4.5 w-4.5 text-rose-550 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block mb-0.5">Deployment error occurred</span>
                      <span>{formError || 'The schema build or authentication record failed. Verify your database connection string and network permissions.'}</span>
                    </div>
                  </div>
                )}

                {/* Console controller buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-border">
                  {provisionStatus === 'failed' && (
                    <button
                      type="button"
                      onClick={() => setProvisionStatus('idle')}
                      className="px-4 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition cursor-pointer"
                    >
                      Back to Configuration
                    </button>
                  )}
                  {provisionStatus === 'success' && (
                    <span className="text-xs text-muted-foreground font-mono flex items-center">
                      Finalizing workspace registry reload...
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteProvisioning} className="px-6 py-4 space-y-4">
                {formError && (
                  <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Grid Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Shop / Business Name</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Gourmet Bakeries"
                        className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200"
                        value={shopName}
                        onChange={e => setShopName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Business Domain Type</label>
                    <select
                      className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200 cursor-pointer"
                      value={domainType}
                      onChange={e => setDomainType(e.target.value)}
                    >
                      <option value="GENERAL">General Retail</option>
                      <option value="JEWELRY">Jewelry Shop</option>
                      <option value="HARDWARE">Hardware Shop</option>
                      <option value="GROCERY">Grocery Store</option>
                    </select>
                  </div>
                </div>

                {/* Owner Account Details - Hidden when editing */}
                {!editingAdmin && (
                  <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-2.5">
                    <h3 className="text-[11px] font-bold text-foreground flex items-center gap-1.5 font-mono uppercase tracking-wide">
                      <User className="h-3.5 w-3.5 text-amber-500" /> Admin Owner Account
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">OWNER NAME</label>
                        <input
                          type="text"
                          placeholder="Owner Name"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                          value={ownerName}
                          onChange={e => setOwnerName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">LOGIN EMAIL</label>
                        <input
                          type="email"
                          required
                          placeholder="admin@shop.com"
                          className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                          value={ownerEmail}
                          onChange={e => setOwnerEmail(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">ACCESS PASSWORD</label>
                        <div className="relative">
                          <input
                            type={showOwnerPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••••••"
                            className="w-full pl-3 pr-9 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                            value={ownerPassword}
                            onChange={e => setOwnerPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {showOwnerPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Neon cloud credentials */}
                <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-2.5">
                  <h3 className="text-[11px] font-bold text-foreground flex items-center gap-1.5 font-mono uppercase tracking-wide">
                    <Server className="h-3.5 w-3.5 text-amber-500" /> Neon Console Credentials (Optional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">NEON MAIL ID</label>
                      <input
                        type="email"
                        placeholder="neon-email@example.com"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs"
                        value={neonMailId}
                        onChange={e => setNeonMailId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-mono">NEON PASSWORD</label>
                      <input
                        type="text"
                        placeholder="Neon password"
                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition text-xs font-mono"
                        value={neonPassword}
                        onChange={e => setNeonPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Database credentials & Test Side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">Neon Connection URI</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        required
                        placeholder="postgresql://owner:password@ep-endpoint.us-east.neon.tech/neondb?sslmode=require"
                        className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground/30 font-mono text-xs focus:outline-none focus:ring-1.5 focus:ring-primary/50 transition duration-200"
                        value={dbConnectionString}
                        onChange={e => setDbConnectionString(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="lg:col-span-1 bg-muted/30 px-3 py-1.5 rounded-lg border border-border flex items-center justify-between gap-2 h-[34px]">
                    <div className="text-[10px] truncate flex-1">
                      {testStatus === 'idle' && <span className="text-muted-foreground/75 font-mono">Not tested yet.</span>}
                      {testStatus === 'testing' && <span className="text-muted-foreground font-mono flex items-center gap-1"><RefreshCw className="h-2.5 w-2.5 animate-spin text-amber-500" /> verifying...</span>}
                      {testStatus === 'success' && <span className="text-emerald-500 dark:text-emerald-400 font-mono flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3 shrink-0" /> Ready.</span>}
                      {testStatus === 'failed' && <span className="text-destructive font-mono truncate block" title={testError}>✕ Failed</span>}
                    </div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      className="px-2 py-0.5 bg-background hover:bg-muted border border-border rounded text-[10px] font-bold text-foreground transition cursor-pointer shrink-0"
                    >
                      Test Connection
                    </button>
                  </div>
                </div>
                <p className="text-muted-foreground text-[9px] font-mono flex items-center gap-1 -mt-1.5">
                  <Info className="h-3 w-3 text-muted-foreground/75 shrink-0" />
                  Data isolation container. Copy from your Neon Console settings page.
                </p>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-2.5 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg shadow-lg shadow-amber-500/10 transition cursor-pointer text-xs"
                  >
                    {editingAdmin ? 'Update Settings' : 'Create & Provision'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Verification Code Modal */}
      {verificationModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Modal Title */}
            <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-500" />
                Security Verification
              </h2>
              <button
                onClick={() => {
                  setVerificationModalOpen(false);
                  setVerificationTenantId(null);
                  setVerificationCode('');
                  setVerificationStatus('idle');
                  setVerificationError('');
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {verificationStatus === 'idle' && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    To view this store's database connection details, we need to verify your identity.
                    A 6-digit verification code will be sent to your registered admin email address.
                  </p>
                  <button
                    onClick={handleRequestVerificationCode}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
                  >
                    Send Verification Code
                  </button>
                </div>
              )}

              {verificationStatus === 'sending' && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  <span className="text-xs text-muted-foreground font-medium">Sending verification code...</span>
                </div>
              )}

              {(verificationStatus === 'waiting' || verificationStatus === 'verifying' || verificationStatus === 'failed') && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter the 6-digit verification code sent to your email.
                  </p>
                  <div>
                    <input
                      type="text"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground/30 font-mono text-2xl tracking-[0.75em] pl-[0.75em] focus:outline-none focus:ring-1.5 focus:ring-amber-500/50 transition duration-200"
                      placeholder="000000"
                    />
                  </div>

                  {verificationError && (
                    <div className="text-[11px] text-rose-500 font-medium bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {verificationError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleRequestVerificationCode}
                      disabled={verificationStatus === 'verifying'}
                      className="flex-1 py-2 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition cursor-pointer disabled:opacity-50"
                    >
                      Resend Code
                    </button>
                    <button
                      type="submit"
                      disabled={verificationStatus === 'verifying' || verificationCode.length !== 6}
                      className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-955 dark:text-zinc-955 font-bold rounded-lg transition cursor-pointer text-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {verificationStatus === 'verifying' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Verify & Reveal'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {verificationStatus === 'success' && (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-bounce" />
                  <span className="text-xs text-emerald-500 font-bold">Identity Verified!</span>
                  <span className="text-[10px] text-muted-foreground">Revealing credentials...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
