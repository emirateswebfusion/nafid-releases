import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Users, UserPlus, Mail, Shield, Save, Loader2, Trash, X, 
  Search, SlidersHorizontal, User, CheckCircle2, Check,
  AlertCircle, Edit, KeyRound, Landmark, Lock, Eye, EyeOff, DollarSign,
  Percent, Trash2, Tag, ShieldAlert, FileText, RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { PermissionSelector } from './PermissionSelector';
import { convertLegacyRestrictedPageToPermissions, ALL_PERMISSION_KEYS } from '../utils/permissions';

interface StaffMember {
  user_id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF' | 'BILLER';
  permissions?: string[] | null;
  restricted_page?: string | null;
  created_at: string;
}

const CLOUD_API = import.meta.env.VITE_CLOUD_API || 'http://localhost:3001';
const STAFF_CACHE_KEY = 'nafid_staff_cache';

// Helper to generate elegant username gradients
function getAvatarGradient(name: string, role: string) {
  if (role === 'OWNER' || role === 'ADMIN') {
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
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [statusMessage]);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'OWNER' | 'STAFF' | 'BILLER'>('ALL');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF' as 'OWNER' | 'STAFF' | 'BILLER',
  });

  // Fetch Staff List with Offline Local Cache Fallback
  const fetchStaff = useCallback(async () => {
    setFetching(true);
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
    } fontFinally: {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Remove / Delete Staff Member
  const handleRemoveStaff = (id: string, name: string) => {
    if (id === userId) {
      setStatusMessage({ text: 'Security Violation: Cannot delete your own Owner account!', type: 'error' });
      return;
    }
    setStaffToDelete({ id, name });
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteStaff = async () => {
    if (!staffToDelete) return;
    setDeleteSaving(true);
    const { id, name } = staffToDelete;
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
        setDeleteConfirmOpen(false);
        setStaffToDelete(null);
      } else {
        setStatusMessage({ text: data.error || 'Failed to remove staff member', type: 'error' });
      }
    } catch {
      // Offline deletion fallback
      const updated = staff.filter(s => s.user_id !== id);
      setStaff(updated);
      localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
      setStatusMessage({ text: `Removed "${name}" locally (Offline Mode)`, type: 'success' });
      setDeleteConfirmOpen(false);
      setStaffToDelete(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  // Start Editing Staff Member
  const handleStartEdit = (member: StaffMember) => {
    setEditingStaffId(member.user_id);
    const memberRole = member.role === 'OWNER' || member.role === 'ADMIN' ? 'OWNER' : 'STAFF';
    setFormData({
      name: member.name,
      email: member.email,
      password: '', // Leave blank unless updating
      role: memberRole,
    });

    let perms: string[] = [];
    if (Array.isArray(member.permissions) && member.permissions.length > 0) {
      perms = member.permissions;
    } else {
      perms = convertLegacyRestrictedPageToPermissions(member.restricted_page);
    }
    setSelectedPermissions(perms);
    setView('edit');
  };

  // Save / Update Staff Member
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const permsPayload = formData.role === 'OWNER' ? ['*'] : selectedPermissions;

    if (view === 'add') {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        permissions: permsPayload,
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
            permissions: permsPayload,
            created_at: new Date().toISOString()
          };
          const updated = [...staff, newMember];
          setStaff(updated);
          localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
          setView('list');
          setFormData({ name: '', email: '', password: '', role: 'STAFF' });
          setSelectedPermissions([]);
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
          permissions: permsPayload,
          created_at: new Date().toISOString()
        };
        const updated = [...staff, newMember];
        setStaff(updated);
        localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(updated));
        setView('list');
        setFormData({ name: '', email: '', password: '', role: 'STAFF' });
        setSelectedPermissions([]);
        setStatusMessage({ text: 'Saved staff account locally (Offline Mode)', type: 'success' });
      } finally {
        setLoading(false);
      }
    } else if (view === 'edit' && editingStaffId) {
      const payload = {
        name: formData.name,
        role: formData.role,
        permissions: permsPayload,
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
            permissions: permsPayload
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
          permissions: permsPayload
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
        <div className="flex items-center justify-between gap-4 px-5 py-3 select-none">
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
            <button onClick={() => { setView('list'); setSelectedPermissions([]); setEditingStaffId(null); }}
              className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center shadow-xs"
              title="Back to list">
              <X className="w-4 h-4 text-destructive" />
            </button>
          ) : (
            <button onClick={onClose}
              className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30 flex items-center justify-center shadow-xs"
              title="Close">
              <X className="w-4 h-4 text-destructive" />
            </button>
          )}
        </div>
      </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/10 p-6 space-y-6">
        
        {/* Floating Status Toast */}
        {statusMessage && (
          <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2 w-full max-w-md pointer-events-none">
            <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
              <div className={clsx("p-2 rounded-xl shrink-0", statusMessage.type === 'success' ? "bg-emerald-500/25 text-emerald-400" : "bg-red-500/25 text-red-400")}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0 leading-snug">
                <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">
                  {statusMessage.type === 'success' ? 'STAFF MANAGEMENT' : 'STAFF ALERT'}
                </span>
                <span className="text-white font-bold text-xs block leading-tight">{statusMessage.text}</span>
              </div>
              <button onClick={() => setStatusMessage(null)} className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0 w-full select-none">
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
          <div className="flex-1 flex flex-col min-h-0 w-full bg-card border border-border/85 rounded-3xl shadow-sm overflow-hidden select-none">
            
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
                  setSelectedPermissions(['OPT_VIEW_GST', 'OPT_APPLY_DISCOUNT', 'BILLING']);
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
                    const isOwnerRole = member.role === 'OWNER' || member.role === 'ADMIN';
                    const permsList: string[] = isOwnerRole 
                      ? ['*']
                      : Array.isArray(member.permissions) && member.permissions.length > 0
                      ? member.permissions
                      : convertLegacyRestrictedPageToPermissions(member.restricted_page);
                    
                    return (
                      <div 
                        key={member.user_id} 
                        className="bg-card border border-border rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 flex flex-col justify-between group relative select-none"
                      >
                        {/* Role Header Badge */}
                        <div className="absolute top-4 right-4">
                          <span className={clsx(
                            "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                            isOwnerRole ? "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          )}>
                            {isOwnerRole ? 'OWNER' : 'STAFF'}
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

                        {/* Permission Pills */}
                        <div className="flex-1 flex flex-col justify-between space-y-4">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mb-1.5">Granted Privileges</p>
                              <div className="flex flex-wrap gap-1.5">
                                {isOwnerRole ? (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-500/5 text-indigo-500 border border-indigo-500/20">
                                    Full Unrestricted Access
                                  </span>
                                ) : permsList.includes('*') ? (
                                  <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                    All Permissions Granted
                                  </span>
                                ) : permsList.length > 0 ? (
                                  permsList.slice(0, 4).map(perm => (
                                    <span key={perm} className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                      {perm}
                                    </span>
                                  )).concat(
                                    permsList.length > 4 ? [
                                      <span key="more" className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                        +{permsList.length - 4} more
                                      </span>
                                    ] : []
                                  )
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    No Permissions Assigned
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
                      <div className="relative flex items-center">
                        <input 
                          required={view === 'add'}
                          type={showPassword ? 'text' : 'password'} 
                          value={formData.password}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                          placeholder={view === 'edit' ? 'Leave blank to keep current' : '••••••••'}
                          className="w-full bg-background border border-border/80 rounded-xl p-3 pr-10 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(p => !p)}
                          className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                          title={showPassword ? 'Hide password' : 'View password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
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
                      onClick={() => setFormData({...formData, role: 'STAFF'})}
                      className={clsx(
                        "flex items-center gap-4 p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden select-none",
                        formData.role === 'STAFF' 
                          ? "bg-primary/5 border-primary shadow-sm" 
                          : "bg-background border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={clsx(
                        "p-2.5 rounded-xl shrink-0",
                        formData.role === 'STAFF' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={clsx("text-xs font-bold", formData.role === 'STAFF' ? "text-primary" : "text-foreground")}>STAFF ACCOUNT</h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Standard operator with granular permission control set by Owner</p>
                      </div>
                      {formData.role === 'STAFF' && (
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

                {/* Section 3: Permission Configuration */}
                {formData.role === 'STAFF' && (
                  <section className="space-y-2">
                    <PermissionSelector
                      selectedPermissions={selectedPermissions}
                      onChange={setSelectedPermissions}
                    />
                  </section>
                )}
              </div>

              {/* Action row at bottom */}
              <div className="border-t border-border/50 bg-background px-6 py-4 shrink-0 flex items-center justify-end gap-3">
                <button
                  type="button" 
                  onClick={() => { setView('list'); setSelectedPermissions([]); setEditingStaffId(null); }}
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
      {/* Delete Staff Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => { if (!deleteSaving) { setDeleteConfirmOpen(false); setStaffToDelete(null); } }}
        closeButton={null}
        title={
          <div className="flex items-center gap-2.5 font-bold text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            <span>Remove Staff Member</span>
          </div>
        }
      >
        <div className="space-y-4 min-w-[400px] text-foreground">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Are you sure?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This will remove <strong>"{staffToDelete?.name}"</strong> from your staff directory and revoke their access to billing and dashboards.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => { setDeleteConfirmOpen(false); setStaffToDelete(null); }}
              disabled={deleteSaving}
              className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteStaff}
              disabled={deleteSaving}
              className="px-5 py-2.5 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm cursor-pointer flex items-center gap-2"
            >
              {deleteSaving ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Removing...</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Remove Staff</>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
