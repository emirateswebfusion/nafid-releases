import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Users, UserPlus, Mail, Shield, Key, Save, Loader2, Trash, X, 
  Search, SlidersHorizontal, User, ShieldAlert, BarChart3, CheckCircle2, Check,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
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
    title: 'Inventory & Operations',
    desc: 'Back-office stock and supplier workflows',
    color: 'from-emerald-500 to-teal-500',
    pages: [
      { key: 'INVENTORY', label: 'Inventory Manager' },
      { key: 'SCRAP_MANAGER', label: 'Scrap Metal Manager' },
      { key: 'PURCHASE_BILLS', label: 'Purchase Bills / GST' },
      { key: 'STOCK_REPORT', label: 'Stock Reports' }
    ]
  },
  {
    title: 'System Settings',
    desc: 'Application configuration and configurations',
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
  const { token, userId } = useAuthStore();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [view, setView] = useState<'list' | 'add'>('list');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [statusMessage]);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'OWNER' | 'BILLER'>('ALL');
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  const handleRemoveStaff = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from your staff?`)) return;
    try {
      const res = await fetch(`${CLOUD_API}/auth/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStaff(prev => prev.filter(s => s.user_id !== id));
      } else {
        alert(data.error || 'Failed to remove staff');
      }
    } catch {
      alert('Network error');
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'BILLER' as 'OWNER' | 'BILLER',
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setFetching(true);
    try {
      const res = await fetch(`${CLOUD_API}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setFetching(false);
    }
  };

  const handlePageToggle = (pageKey: string) => {
    setSelectedPages(prev =>
      prev.includes(pageKey)
        ? prev.filter(p => p !== pageKey)
        : [...prev, pageKey]
    );
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      ...formData,
      restricted_page: formData.role === 'BILLER' ? selectedPages.join(',') : '',
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
        setStaff(prev => [...prev, {
          user_id: data.user_id,
          name: formData.name || formData.email,
          email: formData.email,
          role: formData.role,
          restricted_page: payload.restricted_page || null,
          created_at: new Date().toLocaleString('en-CA', { hour12: false }).replace(', ', 'T')
        }]);
        setView('list');
        setFormData({ name: '', email: '', password: '', role: 'BILLER' });
        setSelectedPages([]);
      } else {
        setStatusMessage({ text: data.error || 'Failed to add staff', type: 'error' });
      }
    } catch (err) {
      setStatusMessage({ text: 'Network error', type: 'error' });
    } finally {
      setLoading(false);
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
    const focusable = container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
    const idx = Array.from(focusable).indexOf(target as HTMLInputElement);
    if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1]?.focus();
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staff.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            member.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchQuery, roleFilter]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = staff.length;
    const admins = staff.filter(s => s.role === 'OWNER').length;
    const activeStaff = staff.filter(s => s.role === 'BILLER').length;
    return { total, admins, activeStaff };
  }, [staff]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in duration-200">
      {/* Dynamic Themed Header matching InventoryManager */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 gap-4 shadow-sm z-30">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-inner">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base font-black tracking-tight text-foreground truncate">
              {view === 'list' ? 'Staff Administration' : 'Create New Staff Account'}
            </h1>
            {view === 'list' ? (
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{stats.total} staff accounts</p>
            ) : (
              <span className="text-xs text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5">
                {useAuthStore.getState().role === 'OWNER' ? 'Owner' : (useAuthStore.getState().userName || 'Staff')}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {view !== 'list' ? (
            <button onClick={() => { setView('list'); setSelectedPages([]); }}
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
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10 p-6 space-y-6">
        
        {/* Dashboard Stats Row */}
        {view === 'list' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0 max-w-7xl mx-auto w-full">
            <div className="bg-card p-5 rounded-2xl border border-border/80 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
              <div className="p-3.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-extrabold">Total Staff Directory</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{stats.total}</p>
              </div>
            </div>
            <div className="bg-card p-5 rounded-2xl border border-border/80 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
              <div className="p-3.5 rounded-xl bg-purple-500/10 text-purple-500">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-extrabold">Administrators</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{stats.admins}</p>
              </div>
            </div>
            <div className="bg-card p-5 rounded-2xl border border-border/80 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-extrabold">Restricted Staff</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{stats.activeStaff}</p>
              </div>
            </div>
          </div>
        )}

        {/* Directory List View */}
        {view === 'list' && (
          <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full bg-card border border-border/85 rounded-2xl shadow-sm overflow-hidden">
            
            {/* Table Control Header */}
            <div className="p-5 border-b border-border bg-card flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
              {/* Search & Filtering tab */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Search by name or email..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full sm:w-80 bg-background border border-border/80 rounded-xl py-2.5 pl-10 pr-3.5 text-xs text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="flex bg-muted/40 p-1 rounded-xl border border-border/60">
                  <button 
                    onClick={() => setRoleFilter('ALL')}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      roleFilter === 'ALL' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setRoleFilter('OWNER')}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      roleFilter === 'OWNER' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Admins
                  </button>
                  <button 
                    onClick={() => setRoleFilter('BILLER')}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      roleFilter === 'BILLER' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Staff
                  </button>
                </div>
              </div>

              {/* Action Button */}
              <Button 
                onClick={() => setView('add')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold w-full md:w-auto justify-center bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-600/95"
              >
                <UserPlus className="w-4 h-4" /> Add New Staff Member
              </Button>
            </div>

            {/* Staff Grid Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-muted/5">
              {fetching ? (
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
                  <p className="text-xs text-muted-foreground mt-1">Try matching other keywords or add a new member.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredStaff.map((member) => {
                    const avatarGrad = getAvatarGradient(member.name, member.role);
                    const allowedPages = member.restricted_page ? member.restricted_page.split(',').filter(Boolean) : [];
                    
                    return (
                      <div 
                        key={member.user_id} 
                        className="bg-card border border-border/80 rounded-2xl shadow-sm p-5 hover:border-primary/20 hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
                      >
                        {/* Role Header Badge */}
                        <div className="absolute top-4 right-4">
                          <span className={clsx(
                            "text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider",
                            member.role === 'OWNER' ? "bg-indigo-500/10 text-indigo-500" : "bg-emerald-500/10 text-emerald-600"
                          )}>
                            {member.role === 'OWNER' ? 'ADMIN' : 'STAFF'}
                          </span>
                        </div>

                        {/* Profile Info */}
                        <div className="flex items-center gap-4">
                          <div className={clsx(
                            "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0",
                            avatarGrad
                          )}>
                            {member.name[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate pr-12">{member.name}</h3>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-1 font-semibold">
                              <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" /> 
                              {member.email}
                            </p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-border/60 my-4" />

                        {/* Permission Pills */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="space-y-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Access Permissions</p>
                            <div className="flex flex-wrap gap-1.5">
                              {member.role === 'OWNER' ? (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-500/5 text-indigo-500 border border-indigo-500/20">
                                  Full Administrator Access
                                </span>
                              ) : allowedPages.length > 0 ? (
                                allowedPages.map(pageKey => (
                                  <span key={pageKey} className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                    {pageKey.replace(/_/g, ' ')}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/5 text-emerald-600 border border-emerald-500/20">
                                  All Pages (POS + Backoffice)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Delete overlay/action */}
                          {member.user_id !== userId && member.role !== 'OWNER' && (
                            <div className="mt-5 flex justify-end">
                              <button
                                onClick={() => handleRemoveStaff(member.user_id, member.name)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-all duration-200 border border-red-500/15"
                                title="Remove staff account"
                              >
                                <Trash className="w-3.5 h-3.5" /> Remove Account
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add View */}
        {view === 'add' && (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <form onSubmit={handleAddStaff} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 min-h-0">
              
              {/* Form Content Area */}
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 max-w-full mx-auto w-full" data-enter-nav>

                {/* Section 1: Basic Details */}
                <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-primary uppercase tracking-wider">1. Basic Details</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Full Name *</label>
                      <input 
                        required
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g. John Doe"
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address *</label>
                      <input 
                        required
                        type="email" 
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="staff@example.com"
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Temporary Password *</label>
                      <input 
                        required
                        type="password" 
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        placeholder="••••••••"
                        className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                      />
                    </div>
                  </div>
                </section>

                {/* Section 2: System Role */}
                <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-wider">2. System Role</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'BILLER'})}
                      className={clsx(
                        "flex items-center gap-4 p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden select-none",
                        formData.role === 'BILLER' 
                          ? "bg-primary/5 border-primary shadow-sm" 
                          : "bg-background border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={clsx(
                        "p-2.5 rounded-lg shrink-0",
                        formData.role === 'BILLER' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={clsx("text-xs font-bold", formData.role === 'BILLER' ? "text-primary" : "text-foreground")}>STAFF MEMBER</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Standard access with optional page restrictions</p>
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
                        "flex items-center gap-4 p-4 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden select-none",
                        formData.role === 'OWNER' 
                          ? "bg-primary/5 border-primary shadow-sm" 
                          : "bg-background border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={clsx(
                        "p-2.5 rounded-lg shrink-0",
                        formData.role === 'OWNER' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={clsx("text-xs font-bold", formData.role === 'OWNER' ? "text-primary" : "text-foreground")}>ADMINISTRATOR</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Full access to dashboards, operations and configuration</p>
                      </div>
                      {formData.role === 'OWNER' && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  </div>
                </section>

                {/* Section 3: Allowed Pages / Access Restrictions */}
                {formData.role === 'BILLER' && (
                  <section className="bg-card border border-border/80 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-black text-blue-500 uppercase tracking-wider">3. Access Permissions</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-4 font-semibold leading-relaxed">
                      Staff accounts will be restricted to the checked pages below. Leave all boxes empty to grant full unrestricted access.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.title} className="bg-card border border-border/60 rounded-xl p-4 space-y-3 flex flex-col">
                          <div className="shrink-0 pb-1.5 border-b border-border/40">
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
                                    "flex items-center gap-2.5 p-2.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer select-none active:scale-98",
                                    isChecked 
                                      ? "bg-primary/5 border-primary text-primary" 
                                      : "bg-background border-border hover:bg-muted"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handlePageToggle(page.key)}
                                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
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

              {/* Status Alerts */}
              {statusMessage && (
                <div className="px-4 pt-2">
                  <div className={clsx(
                    "px-3 py-2.5 rounded-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200",
                    statusMessage.type === 'success' ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"
                  )}>
                    {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span className="flex-1">{statusMessage.text}</span>
                  </div>
                </div>
              )}

              {/* Action row at the bottom of the form */}
              <div className="border-t border-border/50 bg-background px-4 py-3 shrink-0 flex items-center justify-end gap-3">
                <button
                  type="button" 
                  onClick={() => { setView('list'); setSelectedPages([]); }}
                  className="px-5 py-2.5 bg-muted hover:bg-muted/80 border border-border/80 text-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {loading ? 'Saving...' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
