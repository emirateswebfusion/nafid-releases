import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Users, UserPlus, Mail, Shield, Save, Loader2, Trash, X, 
  Search, SlidersHorizontal, User, CheckCircle2, Check,
  AlertCircle, Edit, KeyRound, Landmark, Lock, Eye, DollarSign,
  Percent, Trash2, Tag, ShieldAlert
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';

interface StaffMember {
  user_id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'BILLER';
  restricted_page?: string | null;
  created_at: string;
}

const CLOUD_API = import.meta.env.VITE_CLOUD_API || 'http://localhost:3001';
const STAFF_CACHE_KEY = 'nafid_staff_cache';

const OPERATIONAL_CONTROLS = [
  { key: 'OPT_VIEW_GST', label: 'View & Sell GST Products', desc: 'Allow staff to view and process GST items (disabling restricts to Non-GST items)', icon: Tag },
  { key: 'OPT_VIEW_COST', label: 'View Purchase Prices & Margins', desc: 'Allow staff to view purchase cost & profit margins in inventory', icon: Eye },
  { key: 'OPT_APPLY_DISCOUNT', label: 'Apply Manual Discounts', desc: 'Allow staff to apply line-item or bill-level discounts on checkout', icon: Percent },
  { key: 'OPT_DELETE_INVOICE', label: 'Delete & Void Invoices', desc: 'Allow staff to delete completed invoices & transaction records', icon: Trash2 },
  { key: 'OPT_EDIT_PRICE', label: 'Override Cart Unit Prices', desc: 'Allow staff to edit product unit prices during billing checkout', icon: DollarSign },
];

const PERMISSION_GROUPS = [
  {
    title: 'Sales & Billing',
    desc: 'Front-facing customer and checkout operations',
    color: 'from-blue-500 to-indigo-500',
    pages: [
      { key: 'BILLING', label: 'Billing / POS Checkout' },
      { key: 'CASHIER_SETTLEMENT', label: 'Cashier Settlement' },
      { key: 'QUOTATIONS', label: 'Quotations Management' },
      { key: 'WARRANTIES', label: 'Warranties Tracking' },
      { key: 'CUSTOMERS', label: 'Customers Directory' }
    ]
  },
  {
    title: 'Financials & Reports',
    desc: 'Revenue, profit margins, tax & inventory reports',
    color: 'from-emerald-500 to-teal-500',
    pages: [
      { key: 'FINANCIAL_REPORT', label: 'Financial & Profit Reports' },
      { key: 'INVENTORY', label: 'Inventory Manager' },
      { key: 'COMBO_OFFERS', label: 'Combo Offers' },
      { key: 'SCRAP_MANAGER', label: 'Scrap Metal Manager' },
      { key: 'PURCHASE_BILLS', label: 'Purchase Bills / GST' },
      { key: 'STOCK_REPORT', label: 'Stock Reports' }
    ]
  },
  {
    title: 'System Configuration',
    desc: 'Application configuration and store preferences',
    color: 'from-purple-500 to-pink-500',
    pages: [
      { key: 'SETTINGS', label: 'System Settings' }
    ]
  }
];

// Helper to generate elegant username gradients
function getAvatarGradient(name: string, role: string) {
  if (role === 'OWNER') {
    return 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white';
  }
  const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'bg-gradient-to-tr from-blue-500 to-cyan-500 text-white',
    'bg-gradient-to-tr from-emerald-400 to-teal-600 text-white',
    'bg-gradient-to-tr from-amber-400 to-orange-500 text-white',
    'bg-gradient-to-tr from-rose-500 to-pink-600 text-white',
    'bg-gradient-to-tr from-fuchsia-500 to-purple-600 text-white'
  ];
  return gradients[charCodeSum % gradients.length];
}

export function StaffManager({ onClose }: { onClose: () => void }) {
  useCloseOnEscape(onClose);
  const { token, userId } = useAuthStore();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [statusMessage]);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'OWNER' | 'BILLER'>('ALL');
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'BILLER' as 'OWNER' | 'BILLER',
  });

  // Fetch Staff List with Offline Local Cache Fallback
  const fetchStaff = useCallback(async () => {
    setFetching(true);
    // Load from cache first for instant UI response
    const cached = localStorage.getItem(STAFF_CACHE_KEY);
    if (cached) {
      try {
        setStaff(JSON.parse(cached));
      } catch (e) {
        console.warn('Failed to parse staff cache');
      }
    }

    try {
      const res = await fetch(`${CLOUD_API}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('Offline mode: Using cached staff list');
      if (!cached) {
        setStatusMessage({ text: 'Operating offline - showing local staff cache', type: 'error' });
      }
    } finally {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Remove / Delete Staff Member
  const handleRemoveStaff = async (id: string, name: string) => {
    if (id === userId) {
      setStatusMessage({ text: 'Security Violation: Cannot delete your own Owner account!', type: 'error' });
      return;
    }

    if (!window.confirm(`Are you sure you want to remove "${name}" from your NAFID staff directory?\n\nThis will revoke their access to billing and dashboards.`)) return;
    
    try {
      const res = await fetch(`${CLOUD_API}/auth/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const updated = staff.filter(s => s.user_id !== id);
        setStaff(updated);
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
        setStatusMessage({ text: `Staff account "${name}" successfully deleted`, type: 'success' });
      } else {
        setStatusMessage({ text: data.error || 'Failed to remove staff member', type: 'error' });
      }
    } catch {
      // Offline deletion fallback
      const updated = staff.filter(s => s.user_id !== id);
      setStaff(updated);
      localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
      setStatusMessage({ text: `Removed "${name}" locally (Offline Mode)`, type: 'success' });
    }
  };

  // Start Editing Staff Member
  const handleStartEdit = (member: StaffMember) => {
    setEditingStaffId(member.user_id);
    setFormData({
      name: member.name,
      email: member.email,
      password: '', // Leave blank unless updating
      role: member.role,
    });
    setSelectedPages(member.restricted_page ? member.restricted_page.split(',').filter(Boolean) : []);
    setView('edit');
  };

  const handlePageToggle = (key: string) => {
    setSelectedPages(prev =>
      prev.includes(key)
        ? prev.filter(p => p !== key)
        : [...prev, key]
    );
  };

  // Save / Update Staff Member
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const permissionsStr = formData.role === 'BILLER' ? selectedPages.join(',') : '';

    if (view === 'add') {
      const payload = {
        ...formData,
        restricted_page: permissionsStr,
      };
      try {
        const res = await fetch(`${CLOUD_API}/auth/staff`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          const newMember: StaffMember = {
            user_id: data.user_id || `local-${Date.now()}`,
            name: formData.name || formData.email,
            email: formData.email,
            role: formData.role,
            restricted_page: permissionsStr || null,
            created_at: new Date().toISOString()
          };
          const updated = [...staff, newMember];
          setStaff(updated);
          localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
          setView('list');
          setFormData({ name: '', email: '', password: '', role: 'BILLER' });
          setSelectedPages([]);
          setStatusMessage({ text: `Staff account "${formData.name}" created successfully!`, type: 'success' });
        } else {
          setStatusMessage({ text: data.error || 'Failed to add staff member', type: 'error' });
        }
      } catch (err) {
        // Offline addition fallback
        const newMember: StaffMember = {
          user_id: `offline-${Date.now()}`,
          name: formData.name || formData.email,
          email: formData.email,
          role: formData.role,
          restricted_page: permissionsStr || null,
          created_at: new Date().toISOString()
        };
        const updated = [...staff, newMember];
        setStaff(updated);
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
        setView('list');
        setFormData({ name: '', email: '', password: '', role: 'BILLER' });
        setSelectedPages([]);
        setStatusMessage({ text: 'Saved staff account locally (Offline Mode)', type: 'success' });
      } finally {
        setLoading(false);
      }
    } else if (view === 'edit' && editingStaffId) {
      const payload = {
        name: formData.name,
        role: formData.role,
        restricted_page: permissionsStr,
        ...(formData.password ? { password: formData.password } : {})
      };
      try {
        const res = await fetch(`${CLOUD_API}/auth/staff/${editingStaffId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (res.ok || res.status === 404) {
          const updated = staff.map(s => s.user_id === editingStaffId ? {
            ...s,
            name: formData.name,
            role: formData.role,
            restricted_page: permissionsStr || null
          } : s);
          setStaff(updated);
          localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
          setView('list');
          setEditingStaffId(null);
          setStatusMessage({ text: `Updated staff permissions for "${formData.name}"`, type: 'success' });
        } else {
          const data = await res.json();
          setStatusMessage({ text: data.error || 'Failed to update staff member', type: 'error' });
        }
      } catch (err) {
        // Offline update fallback
        const updated = staff.map(s => s.user_id === editingStaffId ? {
          ...s,
          name: formData.name,
          role: formData.role,
          restricted_page: permissionsStr || null
        } : s);
        setStaff(updated);
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
        setView('list');
        setEditingStaffId(null);
        setStatusMessage({ text: `Updated "${formData.name}" locally (Offline Mode)`, type: 'success' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
    e.preventDefault();
    const container = target.closest('[data-enter-nav]');
    if (!container) return;
    const focusable = container.querySelectorAll<HTMLElement>('[data-select-trigger]:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) {
      const nextEl = focusable[idx + 1];
      nextEl?.focus();
      if (nextEl?.hasAttribute('data-select-trigger')) setTimeout(() => nextEl.click(), 0);
    } else if (idx >= 0) {
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-enter-submit]')?.click();
    }
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staff.filter(member => {
      const matchesSearch = (member.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (member.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchQuery, roleFilter]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = staff.length;
    const owners = staff.filter(s => s.role === 'OWNER').length;
    const staffMembers = staff.filter(s => s.role === 'BILLER').length;
    return { total, owners, staffMembers };
  }, [staff]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200 font-sans">
      
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card shadow-sm z-30">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between py-4 gap-4 select-none">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base font-black tracking-tight text-foreground truncate">
              {view === 'list' ? 'Staff Administration' : view === 'add' ? 'Create New Staff Member' : 'Edit Staff Member Privileges'}
            </h1>
            {view === 'list' ? (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{stats.total} staff accounts configured</p>
            ) : (
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                Owner Mode: {useAuthStore.getState().userName || 'Owner'}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {view !== 'list' ? (
            <button onClick={() => { setView('list'); setSelectedPages([]); setEditingStaffId(null); }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Back to list">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
              title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10 p-6 space-y-6">
        
        {/* Status Alert Overlay */}
        {statusMessage && (
          <div className="max-w-7xl mx-auto w-full">
            <div className={clsx(
              "px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in duration-200",
              statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
            )}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" /> : <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />}
              <span className="flex-1 font-semibold">{statusMessage.text}</span>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0 max-w-7xl mx-auto w-full select-none">
            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-inner group-hover:scale-105 transition-transform shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-2xl font-black text-foreground font-mono">{stats.total}</p>
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Total Staff Directory</p>
              </div>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-inner group-hover:scale-105 transition-transform shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-2xl font-black text-foreground font-mono">{stats.owners}</p>
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Owner Accounts</p>
              </div>
            </div>
            <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-inner group-hover:scale-105 transition-transform shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div className="leading-tight text-left">
                <p className="text-2xl font-black text-foreground font-mono">{stats.staffMembers}</p>
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">Configured Staff</p>
              </div>
            </div>
          </div>
        )}

        {/* Directory List View */}
        {view === 'list' && (
          <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full bg-card border border-border/85 rounded-3xl shadow-sm overflow-hidden select-none">
            
            {/* Table Control Header */}
            <div className="p-5 border-b border-border bg-card flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45" />
                  <input 
                    type="text" 
                    placeholder="Search by name or email..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 text-xs bg-background/50 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background transition-all placeholder:text-muted-foreground/40 font-semibold text-foreground w-full sm:w-80"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground p-1 hover:bg-muted rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner select-none !w-auto">
                  <button 
                    onClick={() => setRoleFilter('ALL')}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                      roleFilter === 'ALL' ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    All Accounts
                  </button>
                  <button 
                    onClick={() => setRoleFilter('OWNER')}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                      roleFilter === 'OWNER' ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    Owner
                  </button>
                  <button 
                    onClick={() => setRoleFilter('BILLER')}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                      roleFilter === 'BILLER' ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    Staff
                  </button>
                </div>
              </div>

              <Button 
                onClick={() => {
                  setView('add');
                  setFormData({ name: '', email: '', password: '', role: 'BILLER' });
                  setSelectedPages(['OPT_VIEW_GST', 'OPT_APPLY_DISCOUNT', 'BILLING']);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold w-full md:w-auto justify-center bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-600/95 shadow-sm"
              >
                <UserPlus className="w-4 h-4" /> Add New Staff Member
              </Button>
            </div>

            {/* Staff Grid Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-muted/5">
              {fetching && staff.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skel-${i}`} className="bg-card p-5 rounded-2xl border border-border shadow-sm space-y-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                        <div className="space-y-2 w-full">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20 bg-card rounded-xl border border-dashed border-border/80">
                  <Users className="w-16 h-16 opacity-20 mb-3" />
                  <p className="text-base font-extrabold text-foreground">No staff accounts found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try matching other keywords or add a new staff member.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredStaff.map((member) => {
                    const avatarGrad = getAvatarGradient(member.name || 'Staff', member.role);
                    const permissionsList = member.restricted_page ? member.restricted_page.split(',').filter(Boolean) : [];
                    const allowedPages = permissionsList.filter(p => !p.startsWith('OPT_'));
                    const operationalOpts = permissionsList.filter(p => p.startsWith('OPT_'));
                    
                    return (
                      <div 
                        key={member.user_id} 
                        className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative select-none"
                      >
                        {/* Role Header Badge */}
                        <div className="absolute top-4 right-4">
                          <span className={clsx(
                            "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                            member.role === 'OWNER' ? "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          )}>
                            {member.role === 'OWNER' ? 'OWNER' : 'STAFF'}
                          </span>
                        </div>

                        {/* Profile Info */}
                        <div className="flex items-center gap-4">
                          <div className={clsx(
                            "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0",
                            avatarGrad
                          )}>
                            {(member.name || 'S')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate pr-12">{member.name || member.email}</h3>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-1 font-semibold">
                              <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" /> 
                              {member.email}
                            </p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-border/60 my-4" />

                        {/* Permission & Operational Pills */}
                        <div className="flex-1 flex flex-col justify-between space-y-4">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mb-1.5">Operational Privileges</p>
                              <div className="flex flex-wrap gap-1.5">
                                {member.role === 'OWNER' ? (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-500/5 text-indigo-500 border border-indigo-500/20">
                                    Full Unrestricted Privileges
                                  </span>
                                ) : operationalOpts.length > 0 ? (
                                  operationalOpts.map(optKey => {
                                    const opt = OPERATIONAL_CONTROLS.find(o => o.key === optKey);
                                    return (
                                      <span key={optKey} className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                                        <Check className="w-3 h-3 text-emerald-500" />
                                        {opt ? opt.label : optKey}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    Standard Operational Rules
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mb-1.5">Allowed Pages</p>
                              <div className="flex flex-wrap gap-1.5">
                                {member.role === 'OWNER' ? (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-500/5 text-indigo-500 border border-indigo-500/20">
                                    All Application Pages
                                  </span>
                                ) : allowedPages.length > 0 ? (
                                  allowedPages.map(pageKey => (
                                    <span key={pageKey} className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                      {pageKey.replace(/_/g, ' ')}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/5 text-emerald-600 border border-emerald-500/20">
                                    All Pages Enabled
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                            <button
                              onClick={() => handleStartEdit(member)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                              title="Edit permissions & privileges"
                            >
                              <Edit className="w-3.5 h-3.5" /> Configure Staff
                            </button>

                            {member.user_id !== userId && member.role !== 'OWNER' && (
                              <button
                                onClick={() => handleRemoveStaff(member.user_id, member.name || member.email)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-500 hover:text-white hover:bg-rose-500 rounded-lg transition-all border border-rose-500/15"
                                title="Delete staff account"
                              >
                                <Trash className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add / Edit Form View */}
        {(view === 'add' || view === 'edit') && (
          <div className="flex flex-col flex-1 min-h-0 bg-background border border-border/80 rounded-3xl overflow-hidden shadow-sm">
            <form onSubmit={handleSaveStaff} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 min-h-0">
              
              {/* Form Content Area */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-full mx-auto w-full" data-enter-nav>

                {/* Section 1: Basic Details */}
                <section className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-primary uppercase tracking-wider">
                      1. Account Credentials {view === 'edit' && '(Editing Mode)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name *</label>
                      <input 
                        required
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address *</label>
                      <input 
                        required
                        disabled={view === 'edit'}
                        type="email" 
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="staff@example.com"
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm disabled:opacity-60" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                        {view === 'edit' ? 'Reset Password (Optional)' : 'Temporary Password *'}
                      </label>
                      <input 
                        required={view === 'add'}
                        type="password" 
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        placeholder={view === 'edit' ? 'Leave blank to keep current' : '••••••••'}
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                      />
                    </div>
                  </div>
                </section>

                {/* Section 2: Account Role Selection */}
                <section className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. Account Role</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'BILLER'})}
                      className={clsx(
                        "flex items-center gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden select-none",
                        formData.role === 'BILLER' 
                          ? "bg-primary/5 border-primary shadow-sm" 
                          : "bg-background border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={clsx(
                        "p-2.5 rounded-xl shrink-0",
                        formData.role === 'BILLER' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={clsx("text-xs font-bold", formData.role === 'BILLER' ? "text-primary" : "text-foreground")}>STAFF ACCOUNT</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Standard operator with custom feature & page permissions set by Owner</p>
                      </div>
                      {formData.role === 'BILLER' && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'OWNER'})}
                      className={clsx(
                        "flex items-center gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden select-none",
                        formData.role === 'OWNER' 
                          ? "bg-primary/5 border-primary shadow-sm" 
                          : "bg-background border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={clsx(
                        "p-2.5 rounded-xl shrink-0",
                        formData.role === 'OWNER' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={clsx("text-xs font-bold", formData.role === 'OWNER' ? "text-primary" : "text-foreground")}>OWNER / ADMIN</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Full unrestricted access to store settings, financial reports & staff configuration</p>
                      </div>
                      {formData.role === 'OWNER' && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  </div>
                </section>

                {/* Section 3: Operational & Privacy Controls (Set by Owner) */}
                {formData.role === 'BILLER' && (
                  <section className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-amber-500 uppercase tracking-wider">3. Operational & Privacy Controls (Set by Owner)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {OPERATIONAL_CONTROLS.map((opt) => {
                        const Icon = opt.icon;
                        const isEnabled = selectedPages.includes(opt.key);
                        return (
                          <label
                            key={opt.key}
                            className={clsx(
                              "flex items-start gap-3.5 p-4 rounded-xl border text-xs font-bold transition-all cursor-pointer select-none active:scale-98",
                              isEnabled
                                ? "bg-emerald-500/5 border-emerald-500/40 text-foreground shadow-sm"
                                : "bg-background border-border hover:bg-muted"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handlePageToggle(opt.key)}
                              className="w-4 h-4 mt-0.5 rounded border-border text-emerald-500 focus:ring-emerald-500 cursor-pointer shrink-0"
                            />
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 font-bold text-foreground">
                                <Icon className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span>{opt.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-normal leading-relaxed">{opt.desc}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Section 4: Allowed Application Pages */}
                {formData.role === 'BILLER' && (
                  <section className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                          <SlidersHorizontal className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-black text-blue-500 uppercase tracking-wider">4. Allowed Application Pages</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                      Select which application pages this staff account is allowed to open. Leaving all options unchecked grants access to all standard POS screens.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.title} className="bg-card border border-border/60 rounded-2xl p-4 space-y-3 flex flex-col">
                          <div className="shrink-0 pb-2 border-b border-border/40">
                            <h4 className="text-xs font-extrabold text-foreground flex items-center gap-2">
                              <span className={clsx("w-2 h-2 rounded-full bg-gradient-to-r", group.color)} />
                              {group.title}
                            </h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium leading-tight">{group.desc}</p>
                          </div>
                          
                          <div className="flex-grow space-y-1.5">
                            {group.pages.map((page) => {
                              const isChecked = selectedPages.includes(page.key);
                              return (
                                <label
                                  key={page.key}
                                  className={clsx(
                                    "flex items-center gap-2.5 p-2.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer select-none active:scale-98",
                                    isChecked 
                                      ? "bg-primary/5 border-primary text-primary shadow-sm" 
                                      : "bg-background border-border hover:bg-muted"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handlePageToggle(page.key)}
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                                  />
                                  <span className="truncate">{page.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Action row at bottom */}
              <div className="border-t border-border/50 bg-background px-6 py-4 shrink-0 flex items-center justify-end gap-3">
                <button
                  type="button" 
                  onClick={() => { setView('list'); setSelectedPages([]); setEditingStaffId(null); }}
                  className="px-5 py-2.5 bg-muted hover:bg-muted/80 border border-border/80 text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {loading ? 'Saving...' : view === 'add' ? 'Create Staff Member' : 'Save Staff Configuration'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
