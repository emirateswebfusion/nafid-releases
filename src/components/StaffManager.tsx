import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Users, UserPlus, Mail, Shield, Save, Loader2, Trash, X, 
  Search, SlidersHorizontal, User, CheckCircle2, Check,
  AlertCircle, Edit, KeyRound, Landmark, Lock, Eye, EyeOff, DollarSign,
  FileText, RefreshCw, Calendar, BookOpen, Banknote, Clock, ArrowUpRight,
  ArrowDownLeft, History, Plus, Phone, Award, UserCheck, UserX, CreditCard, ChevronRight, Upload
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { DataUploadModal } from './DataUploadModal';
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { WhatsAppIcon } from './ui/WhatsAppIcon';
import { formatWhatsAppStaffSalaryMessage } from '../utils/whatsappBillHelper';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { Skeleton } from './ui/Skeleton';
import { PermissionSelector } from './PermissionSelector';
import { useFeatureFlagsStore } from '../featureFlags';

interface StaffMember {
  staff_id: string;
  staff_code: string;
  tenant_id: string;
  name: string;
  phone?: string;
  email?: string;
  role_designation?: string;
  user_id?: string | null;
  user_email?: string;
  user_role?: string;
  permissions?: string[];
  user_login_enabled?: boolean | number;
  joining_date?: string;
  monthly_salary: number;
  current_balance: number;
  status: 'ACTIVE' | 'INACTIVE';
  has_pin: boolean;
  created_at: string;
}

interface SavedSystemAccount {
  user_id: string;
  role: 'ADMIN' | 'STAFF';
  permissions: string[];
  login_enabled: boolean;
}

// Cloud API URL — set VITE_CLOUD_API in .env
const CLOUD_API = (import.meta.env.VITE_CLOUD_API as string).replace(/\/$/, '');

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '₹0.00';
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return isNegative ? `-₹${formatted}` : `₹${formatted}`;
}

export function StaffManager({ onClose }: { onClose: () => void }) {
  useCloseOnEscape(onClose);
  const { token, tenantId, userId } = useAuthStore();
  
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
const [activeTab, setActiveTab] = useState<'directory' | 'salary' | 'payments' | 'ledger' | 'attendance'>('directory');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Form states
  const [saving, setSaving] = useState(false);
  const [modalTab, setModalTab] = useState<'basic' | 'compensation' | 'access'>('basic');
  const [formData, setFormData] = useState({
    staff_id: '',
    user_id: '',
    name: '',
    phone: '',
    email: '',
    password: '',
    role_designation: '',
    user_role: 'STAFF' as 'ADMIN' | 'STAFF',
    permissions: [] as string[],
    roleTouched: false,
    permissionsTouched: false,
    accessToggleTouched: false,
    joining_date: new Date().toISOString().split('T')[0],
    monthly_salary: 0,
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    biller_pin: '',
    showSystemAccountSection: false,
    showPassword: false,
  });

  // Transaction form
  const [txnData, setTxnData] = useState({
    type: 'ADVANCE' as 'ADVANCE' | 'SALARY_PAYMENT' | 'BONUS' | 'DEDUCTION' | 'SALARY_ACCRUAL' | 'ADJUSTMENT',
    amount: 0,
    payment_method: 'CASH',
    notes: '',
  });

  // Account linking form
  const [accountData, setAccountData] = useState({
    email: '',
    password: '',
    role: 'STAFF' as 'ADMIN' | 'STAFF',
    permissions: [] as string[],
  });

  // Detail Data for Selected Staff
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [statusMessage]);

  // Load Feature Flags for Attendance & Biller PIN
  useEffect(() => {
    loadFlags(tenantId || undefined);
  }, [tenantId, loadFlags]);

  // Fetch Staff Directory
  const fetchStaff = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      if (window.electronAPI?.dbGetStaff) {
        const rows = await window.electronAPI.dbGetStaff({ tenant_id: tenantId, search: searchQuery, status: statusFilter });
        const list = Array.isArray(rows) ? rows : [];
        setStaffList(list);
        if (!selectedStaffId && list.length > 0) {
          setSelectedStaffId(list[0].staff_id);
        }
      } else {
        // Web fallback
        const res = await fetch(`${CLOUD_API}/api/staff?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : []);
          setStaffList(list);
          if (!selectedStaffId && list.length > 0) {
            setSelectedStaffId(list[0].staff_id);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || errData?.message || `HTTP ${res.status}`);
        }
      }
    } catch (err: any) {
      console.error('[StaffManager] Failed to load staff members:', err);
      setStatusMessage({
        text: err?.message ? `Failed to load staff members (${err.message})` : 'Failed to load staff members',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, searchQuery, statusFilter, token, selectedStaffId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Selected Staff Details
  const selectedStaff = useMemo(() => {
    return staffList.find(s => s.staff_id === selectedStaffId) || null;
  }, [staffList, selectedStaffId]);

  // Load Ledger & Attendance when Selected Staff changes
  const loadStaffDetails = useCallback(async () => {
    if (!selectedStaffId || !tenantId) return;
    try {
      if (window.electronAPI?.dbGetStaffLedger) {
        const ledger = await window.electronAPI.dbGetStaffLedger({ tenant_id: tenantId, staff_id: selectedStaffId });
        setLedgerEntries(Array.isArray(ledger) ? ledger : []);
      }
      if (window.electronAPI?.dbGetStaffAttendance) {
        const att = await window.electronAPI.dbGetStaffAttendance({ tenant_id: tenantId, staff_id: selectedStaffId, month: selectedMonth });
        setAttendanceRecords(Array.isArray(att) ? att : []);
      }
    } catch (err) {
      console.warn('[StaffManager] Error loading staff details:', err);
    }
  }, [selectedStaffId, tenantId, selectedMonth]);

  useEffect(() => {
    loadStaffDetails();
  }, [loadStaffDetails]);

  // Handle Save Staff Member (Add / Edit)
  const fetchSystemAccounts = async () => {
    if (!token) return null;
    try {
      const response = await fetch(`${CLOUD_API}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const users = await response.json();
      return Array.isArray(users) ? users : null;
    } catch {
      return null;
    }
  };

  const saveSystemAccount = async (): Promise<SavedSystemAccount | undefined> => {
    if (!formData.showSystemAccountSection) {
      if (!formData.user_id) return undefined;
      const response = await fetch(`${CLOUD_API}/auth/staff/${encodeURIComponent(formData.user_id)}/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ login_enabled: false }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Could not disable the login account');
      return {
        user_id: formData.user_id,
        role: formData.user_role,
        permissions: formData.permissions,
        login_enabled: false,
      };
    }

    const email = formData.email.trim().toLowerCase();
    if (!email) throw new Error('Email is required for a system login account');
    let userId = formData.user_id;
    let matchingAccount: any = null;
    const accounts = await fetchSystemAccounts();
    if (accounts) {
      matchingAccount = userId
        ? accounts.find((account: any) => account.user_id === userId) || null
        : null;
      if (userId && !matchingAccount) userId = '';
      if (!userId) {
        matchingAccount = accounts.find((account: any) => String(account.email || '').trim().toLowerCase() === email) || null;
      }
      if (matchingAccount) {
        const linkedStaff = staffList.find(staff => staff.user_id === matchingAccount.user_id && staff.staff_id !== formData.staff_id);
        if (linkedStaff) {
          throw new Error(`This login account is already linked to ${linkedStaff.name}`);
        }
        userId = matchingAccount.user_id;
      }
    }
    if (!userId && formData.password.length < 8) {
      throw new Error('New login passwords must be at least 8 characters');
    }
    if (formData.password && formData.password.length < 8) {
      throw new Error('Passwords must be at least 8 characters');
    }

    const isExistingAccount = Boolean(userId);
    const role = matchingAccount && !formData.roleTouched
      ? (matchingAccount.role === 'ADMIN' ? 'ADMIN' : 'STAFF')
      : formData.user_role;
    const permissions = matchingAccount && !formData.permissionsTouched
      ? (Array.isArray(matchingAccount.permissions) ? matchingAccount.permissions : [])
      : formData.permissions;
    const response = await fetch(
      `${CLOUD_API}/auth/staff${isExistingAccount ? `/${encodeURIComponent(userId)}` : ''}`,
      {
        method: isExistingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: formData.name.trim(),
          email,
          password: formData.password || undefined,
          role,
          permissions,
          login_enabled: true,
        }),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && result?.error === 'Email already registered') {
        throw new Error('This email is already registered. Check for an existing login in this shop, or use a different email.');
      }
      throw new Error(result?.error || 'Could not save the login account');
    }
    const savedUserId = result.user_id || userId;
    return savedUserId ? {
      user_id: savedUserId,
      role: result.role === 'ADMIN' ? 'ADMIN' : role,
      permissions: Array.isArray(result.permissions) ? result.permissions : permissions,
      login_enabled: true,
    } : undefined;
  };

  const openEditStaff = (staff: StaffMember) => {
    setFormData({
      staff_id: staff.staff_id,
      user_id: staff.user_id || '',
      name: staff.name,
      phone: staff.phone || '',
      email: staff.user_email || staff.email || '',
      password: '',
      role_designation: staff.role_designation || '',
      user_role: (staff.user_role as any) || 'STAFF',
      permissions: staff.permissions || [],
      roleTouched: false,
      permissionsTouched: false,
      accessToggleTouched: false,
      joining_date: staff.joining_date || new Date().toISOString().split('T')[0],
      monthly_salary: staff.monthly_salary || 0,
      status: staff.status,
      biller_pin: '',
      showSystemAccountSection: Boolean(staff.user_email || staff.user_id) && staff.user_login_enabled !== false && staff.user_login_enabled !== 0,
      showPassword: false,
    });
    setModalTab('basic');
    setShowAddModal(true);

    // Permissions live with the login account. Load them from the account API when
    // opening an existing profile so the editor reflects what was actually saved.
    if (token) {
      fetchSystemAccounts().then(users => {
        if (!users) return;
        const email = String(staff.user_email || staff.email || '').trim().toLowerCase();
        const account = staff.user_id
          ? users.find((user: any) => user.user_id === staff.user_id)
          : users.find((user: any) => String(user.email || '').trim().toLowerCase() === email);
        if (!account) return;
        const linkedStaff = staffList.find(candidate => candidate.user_id === account.user_id && candidate.staff_id !== staff.staff_id);
        if (linkedStaff) return;
        setFormData(current => current.staff_id === staff.staff_id ? {
          ...current,
          user_id: account.user_id,
          email: account.email || current.email,
          user_role: account.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
          permissions: Array.isArray(account.permissions) ? account.permissions : [],
          showSystemAccountSection: current.accessToggleTouched ? current.showSystemAccountSection : account.login_enabled !== false,
        } : current);
      });
    }
  };

  const handleSaveStaff = async () => {
    if (!tenantId || !formData.name.trim()) {
      setStatusMessage({ text: 'Staff Name is mandatory', type: 'error' });
      return;
    }
    if (formData.showSystemAccountSection) {
      const email = formData.email.trim();
      if (!email) {
        setStatusMessage({ text: 'Email is required for a system login account', type: 'error' });
        return;
      }
      if (formData.password && formData.password.length < 8) {
        setStatusMessage({ text: 'Login passwords must be at least 8 characters', type: 'error' });
        return;
      }
    }

    setSaving(true);
    let profileSaved = false;
    let savedStaff: any;
    try {
      if (window.electronAPI?.dbSaveStaff) {
        savedStaff = await window.electronAPI.dbSaveStaff({
          staff_id: formData.staff_id || undefined,
          tenant_id: tenantId,
          name: formData.name.trim(),
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          role_designation: formData.role_designation.trim() || undefined,
          joining_date: formData.joining_date || undefined,
          monthly_salary: Number(formData.monthly_salary) || 0,
          status: formData.status,
          user_id: formData.user_id || undefined,
          biller_pin: formData.biller_pin.trim() || undefined,
        });
        profileSaved = true;
      } else {
        const res = await fetch(`${CLOUD_API}/api/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            staff_id: formData.staff_id || undefined,
            tenant_id: tenantId,
            name: formData.name.trim(),
            phone: formData.phone.trim() || undefined,
            email: formData.email.trim() || undefined,
            role_designation: formData.role_designation.trim() || undefined,
            joining_date: formData.joining_date || undefined,
            monthly_salary: Number(formData.monthly_salary) || 0,
            status: formData.status,
            user_id: formData.user_id || undefined,
            biller_pin: formData.biller_pin.trim() || undefined,
          })
        });
        if (res.ok) {
          savedStaff = await res.json();
          profileSaved = true;
        } else {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save staff record');
        }
      }

      if (formData.showSystemAccountSection || formData.user_id) {
        const accountSettings = await saveSystemAccount();
        const accountUserId = accountSettings?.user_id;
        if (accountUserId) {
          setFormData(current => current.staff_id === formData.staff_id ? { ...current, user_id: accountUserId } : current);
        }
        if (accountUserId && accountUserId !== savedStaff?.user_id) {
          const linkedStaff = {
            staff_id: savedStaff?.staff_id || formData.staff_id || undefined,
            tenant_id: tenantId,
            name: formData.name.trim(),
            phone: formData.phone.trim() || undefined,
            email: formData.email.trim() || undefined,
            role_designation: formData.role_designation.trim() || undefined,
            joining_date: formData.joining_date || undefined,
            monthly_salary: Number(formData.monthly_salary) || 0,
            status: formData.status,
            user_id: accountUserId,
            biller_pin: formData.biller_pin.trim() || undefined,
          };
          if (window.electronAPI?.dbSaveStaff) {
            await window.electronAPI.dbSaveStaff(linkedStaff);
          } else {
            const linkResponse = await fetch(`${CLOUD_API}/api/staff`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(linkedStaff),
            });
            const linkResult = await linkResponse.json().catch(() => ({}));
            if (!linkResponse.ok) throw new Error(linkResult?.error || 'Login was saved but could not be linked to the staff profile');
          }
        }

        if (window.electronAPI?.authSaveLocalUser && accountUserId) {
          await window.electronAPI.authSaveLocalUser({
            user_id: accountUserId,
            tenant_id: tenantId,
            name: formData.name.trim(),
            email: formData.email.trim().toLowerCase(),
            role: accountSettings?.role || formData.user_role,
            permissions: accountSettings?.permissions || formData.permissions,
            login_enabled: accountSettings?.login_enabled ?? formData.showSystemAccountSection,
            clear_password_hash: Boolean(formData.password),
          });
        }
      }

      setStatusMessage({ text: `Staff record "${formData.name}" saved successfully`, type: 'success' });
      setShowAddModal(false);
      await fetchStaff();
      if (savedStaff?.staff_id || formData.staff_id) setSelectedStaffId(savedStaff?.staff_id || formData.staff_id);
    } catch (err: any) {
      const message = err.message || 'Error saving staff record';
      setStatusMessage({
        text: profileSaved ? `Staff profile saved, but login setup failed: ${message}` : message,
        type: 'error',
      });
      if (profileSaved) {
        const savedStaffId = savedStaff?.staff_id || formData.staff_id;
        if (savedStaffId) {
          setFormData(current => ({ ...current, staff_id: savedStaffId }));
          setSelectedStaffId(savedStaffId);
        }
        await fetchStaff();
      }
    } finally {
      setSaving(false);
    }
  };

  // Toggle Staff Active / Inactive Status
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const handleSendWhatsAppSalary = async () => {
    if (!selectedStaff) return;
    const phone = (selectedStaff.phone || '').trim();
    if (!phone) {
      setStatusMessage({ text: 'Staff member does not have a phone number saved', type: 'error' });
      return;
    }
    if (!window.electronAPI?.whatsappSendInvoice) {
      setStatusMessage({ text: 'WhatsApp service not available', type: 'error' });
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const shopNameVal = await window.electronAPI.settingsGet({ tenant_id: tenantId || 'global', key: 'shop_name' });
      const storeName = shopNameVal || 'My Shop';

      const waMsg = formatWhatsAppStaffSalaryMessage({
        shopName: storeName,
        staffName: selectedStaff.name,
        staffCode: selectedStaff.staff_code,
        monthlySalary: selectedStaff.monthly_salary,
        currentBalance: selectedStaff.current_balance,
      });

      const res = await window.electronAPI.whatsappSendInvoice({
        phone,
        message: waMsg,
      });

      if (res?.success) {
        setStatusMessage({ text: 'Salary statement sent to ' + selectedStaff.name + ' via WhatsApp!', type: 'success' });
      } else {
        setStatusMessage({ text: 'WhatsApp Send Failed: ' + (res?.error || 'Unknown error'), type: 'error' });
      }
    } catch (err) {
      console.error('Failed to send salary statement via WhatsApp', err);
      setStatusMessage({ text: 'Failed to send salary statement via WhatsApp', type: 'error' });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleToggleStatus = async (staffMember: StaffMember) => {
    const newStatus = staffMember.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      if (window.electronAPI?.dbSaveStaff) {
        await window.electronAPI.dbSaveStaff({
          staff_id: staffMember.staff_id,
          tenant_id: tenantId!,
          name: staffMember.name,
          status: newStatus,
        });
        setStatusMessage({ text: `${staffMember.name} marked as ${newStatus}`, type: 'success' });
        await fetchStaff();
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update status', type: 'error' });
    }
  };

  const handleUpdateMonthlySalary = async () => {
    if (!selectedStaff || !tenantId) return;
    setSaving(true);
    const payload = {
      staff_id: selectedStaff.staff_id,
      tenant_id: tenantId,
      name: selectedStaff.name,
      phone: selectedStaff.phone,
      email: selectedStaff.email,
      role_designation: selectedStaff.role_designation,
      user_id: selectedStaff.user_id || undefined,
      joining_date: selectedStaff.joining_date,
      monthly_salary: Number(selectedStaff.monthly_salary) || 0,
      status: selectedStaff.status,
    };
    try {
      if (window.electronAPI?.dbSaveStaff) {
        await window.electronAPI.dbSaveStaff(payload);
      } else {
        const response = await fetch(`${CLOUD_API}/api/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Failed to update monthly salary');
      }
      setStatusMessage({ text: `Monthly salary updated for ${selectedStaff.name}`, type: 'success' });
      await fetchStaff();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to update monthly salary', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Handle Add Transaction (Advance, Payment, Bonus, Accrual)
  const handleAddTransaction = async () => {
    if (!selectedStaffId || !tenantId || txnData.amount <= 0) {
      setStatusMessage({ text: 'Valid amount is required', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (window.electronAPI?.dbAddStaffTransaction) {
        const res = await window.electronAPI.dbAddStaffTransaction({
          tenant_id: tenantId,
          staff_id: selectedStaffId,
          type: txnData.type,
          amount: Number(txnData.amount),
          payment_method: txnData.payment_method,
          notes: txnData.notes,
          user_id: userId || undefined,
        });
        if (res.success) {
          setStatusMessage({ text: 'Financial transaction recorded in Staff Ledger', type: 'success' });
          setShowTxnModal(false);
          setTxnData({ type: 'ADVANCE', amount: 0, payment_method: 'CASH', notes: '' });
          await fetchStaff();
          await loadStaffDetails();
        } else {
          setStatusMessage({ text: res.error || 'Transaction failed', type: 'error' });
        }
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to add transaction', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Handle Save Attendance Record
  const handleMarkAttendance = async (staffId: string, date: string, status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY') => {
    if (!tenantId) return;
    try {
      if (window.electronAPI?.dbSaveStaffAttendance) {
        await window.electronAPI.dbSaveStaffAttendance({
          tenant_id: tenantId,
          staff_id: staffId,
          date,
          status,
          user_id: userId || undefined,
        });
        await loadStaffDetails();
      }
    } catch (err: any) {
      setStatusMessage({ text: 'Failed to save attendance', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 border-b border-border bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-inner">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-foreground tracking-tight">Staff Administration & Employee Hub</h1>
              <p className="text-xs text-muted-foreground">Manage employees, salaries, advances, ledger statements & billing accountability</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUploadModal(true)}
              className="gap-2 cursor-pointer font-bold border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              <Upload className="w-4 h-4" /> Upload (CSV/Excel)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setFormData({
                  staff_id: '',
                  user_id: '',
                  name: '',
                  phone: '',
                  email: '',
                  password: '',
                  role_designation: '',
                  user_role: 'STAFF',
                  permissions: [],
                  roleTouched: false,
                  permissionsTouched: false,
                  accessToggleTouched: false,
                  joining_date: new Date().toISOString().split('T')[0],
                  monthly_salary: 0,
                  status: 'ACTIVE',
                  biller_pin: '',
                  showSystemAccountSection: false,
                  showPassword: false,
                });
                setModalTab('basic');
                setShowAddModal(true);
              }}
              className="gap-2 cursor-pointer font-bold"
            >
              <UserPlus className="w-4 h-4" /> Add Staff Member
            </Button>
            <RedCrossButton onClick={onClose} title="Close" />
          </div>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANEL: STAFF DIRECTORY ── */}
        <div className="w-80 border-r border-border bg-card flex flex-col shrink-0">
          {/* Search & Status Filters */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/60 transition-all"
              />
            </div>
            <div className="flex rounded-lg bg-muted/40 p-1 gap-1">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={clsx(
                    'flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer capitalize',
                    statusFilter === st ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {st.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Directory List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {loading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <UserX className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-xs font-bold">No staff records found</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Click "Add Staff Member" to create your first employee record without requiring a login account.</p>
              </div>
            ) : (
              staffList.map(s => {
                const isSelected = s.staff_id === selectedStaffId;
                const isInactive = s.status === 'INACTIVE';
                return (
                  <div
                    key={s.staff_id}
                    onClick={() => setSelectedStaffId(s.staff_id)}
                    className={clsx(
                      'p-3.5 flex items-center gap-3 cursor-pointer transition-all border-l-4',
                      isSelected
                        ? 'bg-primary/5 border-l-primary shadow-inner'
                        : 'border-l-transparent hover:bg-muted/30',
                      isInactive && 'opacity-60 grayscale'
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                        <span className={clsx(
                          'text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider',
                          s.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-500'
                        )}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{s.role_designation || 'Staff Member'}</p>
                      <div className="flex items-center justify-between gap-1 mt-1 text-[10px] font-bold text-muted-foreground">
                        <span className="font-mono text-muted-foreground/70">{s.staff_code}</span>
                        <span className={clsx(s.current_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600')}>
                          Bal: {formatCurrency(s.current_balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: STAFF PROFILE & MODULE TABS ── */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {selectedStaff ? (
            <>
              {/* Staff Profile Overview Header */}
              <div className="bg-card border-b border-border p-5 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-xl shadow-md">
                      {selectedStaff.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-extrabold text-foreground">{selectedStaff.name}</h2>
                        <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-bold">
                          {selectedStaff.staff_code}
                        </span>
                        <span className={clsx(
                          'text-xs font-bold px-2 py-0.5 rounded-full border',
                          selectedStaff.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        )}>
                          {selectedStaff.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">
                        {selectedStaff.role_designation || 'Staff Member'} {selectedStaff.phone && `• ${selectedStaff.phone}`} {selectedStaff.email && `• ${selectedStaff.email}`}
                      </p>
                    </div>
                  </div>

                  {/* Top Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(selectedStaff)}
                      className={clsx(
                        'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5',
                        selectedStaff.status === 'ACTIVE'
                          ? 'border-rose-500/20 text-rose-500 hover:bg-rose-500/10'
                          : 'border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10'
                      )}
                    >
                      {selectedStaff.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {selectedStaff.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openEditStaff(selectedStaff)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                    <button
                      onClick={handleSendWhatsAppSalary}
                      disabled={isSendingWhatsApp}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                      title="Send Salary Statement to Staff via WhatsApp"
                    >
                      {isSendingWhatsApp ? (
                        <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
                      ) : (
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500 shrink-0" />
                      )}
                      <span>WhatsApp Statement</span>
                    </button>
                  </div>
                </div>

                {/* Key Financial Metrics */}
                <div className="grid grid-cols-4 gap-3 mt-4">
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Configured Monthly Salary</p>
                    <p className="text-sm font-black text-foreground mt-0.5">{formatCurrency(selectedStaff.monthly_salary)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                    <p className="text-[10px] font-bold text-amber-600 uppercase">Pending Salary Balance</p>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{formatCurrency(selectedStaff.current_balance)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Biller PIN Status</p>
                    <p className="text-xs font-bold text-foreground mt-1 flex items-center gap-1">
                      {selectedStaff.has_pin ? (
                        <span className="text-emerald-600 flex items-center gap-1"><Lock className="w-3 h-3" /> Configured</span>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">System Account Link</p>
                    <p className="text-xs font-bold text-foreground mt-1 truncate">
                      {selectedStaff.user_email ? (
                        <span className="text-indigo-600 dark:text-indigo-400 truncate">{selectedStaff.user_email}</span>
                      ) : (
                        <span className="text-muted-foreground">No login account</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Module Sub-Tabs */}
                <div className="flex items-center gap-2 border-b border-border/60 -mb-5 mt-4">
                  {[
                    { id: 'directory', label: 'Overview & Profile', icon: User },
                    { id: 'salary', label: 'Salary Book', icon: DollarSign },
                    { id: 'payments', label: 'Advances & Payments', icon: CreditCard },
                    { id: 'ledger', label: 'Staff Ledger', icon: BookOpen },
                    ...(featureFlags?.staff_attendance ? [{ id: 'attendance', label: 'Attendance', icon: Calendar }] : [])
                  ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={clsx(
                          'flex items-center gap-1.5 px-4 py-2.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer',
                          isActive
                            ? 'border-primary text-primary bg-primary/5'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Module Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* ── TAB 1: OVERVIEW & PROFILE ── */}
                {activeTab === 'directory' && (
                  <div className="space-y-6 max-w-3xl">
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                      <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-primary" /> Biller PIN & Security Settings
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Configure a 4-digit numeric code to attribute sales & print actions to this staff member when <strong>Enable Biller PIN</strong> is ON.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="Enter 4-digit PIN"
                          value={formData.biller_pin}
                          onChange={e => setFormData({ ...formData, biller_pin: e.target.value.replace(/\D/g, '') })}
                          className="w-36 px-4 py-2 text-center text-lg font-black font-mono bg-background border border-border rounded-xl outline-none focus:border-primary"
                        />
                        <button
                          onClick={async () => {
                            if (formData.biller_pin.length !== 4) {
                              setStatusMessage({ text: 'PIN must be exactly 4 digits', type: 'error' });
                              return;
                            }
                            await handleSaveStaff();
                          }}
                          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer"
                        >
                          Save Biller PIN
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 2: SALARY BOOK ── */}
                {activeTab === 'salary' && (
                  <div className="space-y-6 max-w-3xl">
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-extrabold text-foreground">Monthly Salary Configuration</h3>
                          <p className="text-xs text-muted-foreground">Set or revise the monthly salary structure for {selectedStaff.name}</p>
                        </div>
                        <button
                          onClick={async () => {
                            setTxnData({ type: 'SALARY_ACCRUAL', amount: selectedStaff.monthly_salary, payment_method: 'N/A', notes: `Accrual for ${new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` });
                            setShowTxnModal(true);
                          }}
                          className="px-3.5 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Accrue Monthly Salary
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                          <input
                            type="number"
                            value={selectedStaff.monthly_salary}
                            onChange={e => {
                              const v = Number(e.target.value) || 0;
                              setStaffList(staffList.map(s => s.staff_id === selectedStaff.staff_id ? { ...s, monthly_salary: v } : s));
                            }}
                            className="w-44 pl-8 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl outline-none focus:border-primary"
                          />
                        </div>
                        <button
                          onClick={handleUpdateMonthlySalary}
                          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer"
                        >
                          Update Monthly Salary
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 3: ADVANCES & PAYMENTS ── */}
                {activeTab === 'payments' && (
                  <div className="space-y-6 max-w-3xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground">Record Advance / Salary Payout</h3>
                        <p className="text-xs text-muted-foreground">Every payout updates the staff ledger and cash register automatically</p>
                      </div>
                      <button
                        onClick={() => {
                          setTxnData({ type: 'ADVANCE', amount: 0, payment_method: 'CASH', notes: '' });
                          setShowTxnModal(true);
                        }}
                        className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Record New Payout
                      </button>
                    </div>

                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-5 py-3 border-b border-border bg-muted/20 font-bold text-xs text-muted-foreground uppercase tracking-wider">
                        Recent Staff Transactions
                      </div>
                      <div className="divide-y divide-border/40">
                        {ledgerEntries.filter(l => l.reference_type !== 'SALARY_ACCRUAL').length === 0 ? (
                          <p className="p-8 text-center text-xs text-muted-foreground">No recent advances or payments recorded</p>
                        ) : (
                          ledgerEntries.filter(l => l.reference_type !== 'SALARY_ACCRUAL').map(l => (
                            <div key={l.ledger_id} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                              <div>
                                <p className="text-xs font-bold text-foreground">{l.description}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(l.transaction_date).toLocaleString('en-IN')}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-rose-500 tabular-nums">−{formatCurrency(l.credit_amount)}</p>
                                <p className="text-[10px] text-muted-foreground">Running Bal: {formatCurrency(l.running_balance)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: STAFF LEDGER ── */}
                {activeTab === 'ledger' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground">Staff Financial Ledger</h3>
                        <p className="text-xs text-muted-foreground">Complete auditable log of salary accruals, advances, bonuses & payouts</p>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                        Net Balance Owed: {formatCurrency(selectedStaff.current_balance)}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Debit (Accrued)</th>
                            <th className="px-4 py-3 text-right">Credit (Paid)</th>
                            <th className="px-4 py-3 text-right">Running Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30 font-medium">
                          {ledgerEntries.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                No ledger transactions found for this staff member
                              </td>
                            </tr>
                          ) : (
                            ledgerEntries.map(l => (
                              <tr key={l.ledger_id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono">{new Date(l.transaction_date).toLocaleDateString('en-IN')}</td>
                                <td className="px-4 py-3 font-bold text-foreground">{l.description}</td>
                                <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">{l.debit_amount > 0 ? `+${formatCurrency(l.debit_amount)}` : '—'}</td>
                                <td className="px-4 py-3 text-right font-bold text-rose-500 tabular-nums">{l.credit_amount > 0 ? `−${formatCurrency(l.credit_amount)}` : '—'}</td>
                                <td className="px-4 py-3 text-right font-black text-foreground tabular-nums">{formatCurrency(l.running_balance)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── TAB 5: ATTENDANCE ── */}
                {activeTab === 'attendance' && featureFlags?.staff_attendance && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-extrabold text-foreground">Staff Attendance Grid</h3>
                        <p className="text-xs text-muted-foreground">Track daily presence, leaves, and working shifts</p>
                      </div>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="px-3 py-1.5 bg-card border border-border rounded-xl text-xs font-bold text-foreground outline-none"
                      />
                    </div>

                    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30 font-medium">
                          {attendanceRecords.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="p-8 text-center text-muted-foreground">
                                No attendance records logged for {selectedMonth}
                              </td>
                            </tr>
                          ) : (
                            attendanceRecords.map(a => (
                              <tr key={a.attendance_id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-foreground">{a.date}</td>
                                <td className="px-4 py-3">
                                  <span className={clsx(
                                    'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                                    a.status === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600' :
                                    a.status === 'ABSENT' ? 'bg-rose-500/10 text-rose-500' :
                                    'bg-amber-500/10 text-amber-600'
                                  )}>
                                    {a.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'] as const).map(st => (
                                      <button
                                        key={st}
                                        onClick={() => handleMarkAttendance(selectedStaff.staff_id, a.date, st)}
                                        className={clsx(
                                          'px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer',
                                          a.status === st ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                                        )}
                                      >
                                        {st[0]}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-bold">Select a staff member from the directory</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Or click "Add Staff Member" to create a new employee record.</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL: ADD / EDIT STAFF MEMBER ═══ */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={null}
        className="max-w-5xl p-0 overflow-hidden"
        closeButton={<></>}
      >
        <div className="flex min-h-[580px] max-h-[82vh] overflow-hidden">

          {/* ── LEFT PANEL: IDENTITY CARD ── */}
          <div className="w-[220px] shrink-0 flex flex-col bg-gradient-to-b from-primary/10 via-primary/5 to-muted/20 border-r border-border/50 p-5 gap-5">

            {/* Top row: label + close */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                {formData.staff_id ? 'Edit Profile' : 'New Employee'}
              </span>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Avatar + name */}
            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="relative">
                <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-primary via-primary to-indigo-600 text-primary-foreground flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-primary/20 w-[72px] h-[72px]">
                  {formData.name.trim() ? formData.name.trim().slice(0, 2).toUpperCase() : 'ST'}
                </div>
                <div className={clsx(
                  'absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-card shadow-sm',
                  formData.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-400'
                )} />
              </div>
              <div className="text-center w-full">
                <h4 className="text-sm font-extrabold text-foreground truncate leading-tight">
                  {formData.name.trim() || 'Employee Name'}
                </h4>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {formData.role_designation || 'No designation'}
                </p>
              </div>
            </div>

            {/* Key Stats */}
            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Monthly Salary</span>
                <span className="text-sm font-black text-foreground font-mono tabular-nums mt-0.5 block">
                  {formatCurrency(formData.monthly_salary)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Biller PIN</span>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3].map(idx => (
                    <div
                      key={idx}
                      className={clsx(
                        'w-2 h-2 rounded-full transition-all duration-200',
                        formData.biller_pin.length > idx ? 'bg-primary shadow-sm' : 'bg-muted-foreground/25'
                      )}
                    />
                  ))}
                  <span className={clsx(
                    'text-[10px] font-bold ml-1',
                    formData.biller_pin.length === 4 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}>
                    {formData.biller_pin.length === 4 ? 'Set' : `${formData.biller_pin.length}/4`}
                  </span>
                </div>
              </div>
              {formData.showSystemAccountSection && (
                <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">System Access</span>
                  <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5 block">{formData.user_role}</span>
                </div>
              )}
              <div className="p-2.5 rounded-xl bg-card/70 border border-border/60">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Status</span>
                <span className={clsx(
                  'text-xs font-extrabold mt-0.5 block',
                  formData.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                )}>
                  {formData.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Tab Nav */}
            <div className="mt-auto space-y-0.5">
              {([
                { id: 'basic' as const, label: 'Profile & Role', icon: User, color: 'text-primary' },
                { id: 'compensation' as const, label: 'Salary & PIN', icon: DollarSign, color: 'text-emerald-600' },
                { id: 'access' as const, label: 'System Access', icon: Shield, color: 'text-indigo-500' },
              ]).map(tab => {
                const Icon = tab.icon;
                const isActive = modalTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setModalTab(tab.id)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-left',
                      isActive
                        ? 'bg-card shadow-sm text-foreground border border-border/60'
                        : 'text-muted-foreground hover:bg-card/40 hover:text-foreground'
                    )}
                  >
                    <Icon className={clsx('w-3.5 h-3.5 shrink-0', isActive ? tab.color : 'text-muted-foreground/50')} />
                    <span>{tab.label}</span>
                    {tab.id === 'access' && formData.showSystemAccountSection && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT PANEL: FORM CONTENT ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* ── TAB 1: BASIC PROFILE ── */}
              {modalTab === 'basic' && (
                <div className="space-y-5 animate-in fade-in duration-200">

                  <div>
                    <h3 className="text-base font-extrabold text-foreground">Basic Profile</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Personal details, contact info & employment record</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="e.g. Suhaib Mohamed"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-bold text-foreground transition-all"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Designation
                      </label>
                      <div className="relative">
                        <Award className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="e.g. Store Manager"
                          value={formData.role_designation}
                          onChange={e => setFormData({ ...formData, role_designation: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {['Store Manager', 'Cashier', 'Sales Associate', 'Accountant', 'Supervisor', 'Inventory Clerk'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormData({ ...formData, role_designation: chip })}
                        className={clsx(
                          'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer',
                          formData.role_designation === chip
                            ? 'bg-primary/10 border-primary/40 text-primary'
                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-border/50" />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Phone</label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="+91 98765 43210"
                          value={formData.phone}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Email</label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          placeholder="staff@example.com"
                          value={formData.email}
                          onChange={e => setFormData({ ...formData, email: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Joining Date</label>
                      <div className="relative">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="date"
                          value={formData.joining_date}
                          onChange={e => setFormData({ ...formData, joining_date: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all font-medium"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Status</label>
                      <div className="flex items-center gap-1.5 p-1 bg-muted/30 border border-border rounded-xl" style={{ height: '42px' }}>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, status: 'ACTIVE' })}
                          className={clsx(
                            'flex-1 h-full text-[11px] font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1',
                            formData.status === 'ACTIVE' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <UserCheck className="w-3 h-3" /> Active
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, status: 'INACTIVE' })}
                          className={clsx(
                            'flex-1 h-full text-[11px] font-extrabold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1',
                            formData.status === 'INACTIVE' ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <UserX className="w-3 h-3" /> Inactive
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 2: SALARY & PIN ── */}
              {modalTab === 'compensation' && (
                <div className="space-y-5 animate-in fade-in duration-200">

                  <div>
                    <h3 className="text-base font-extrabold text-foreground">Salary & Biller PIN</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Set payroll structure and POS authentication PIN</p>
                  </div>

                  {/* Salary card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 shrink-0">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-extrabold text-foreground">Monthly Base Salary</h4>
                        <p className="text-[11px] text-muted-foreground">Drives staff ledger accruals each month</p>
                      </div>
                      <span className="ml-auto shrink-0 text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                        {formatCurrency(formData.monthly_salary)}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-black text-muted-foreground">₹</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={formData.monthly_salary || ''}
                        onChange={e => setFormData({ ...formData, monthly_salary: Math.max(0, Number(e.target.value)) })}
                        className="w-full pl-8 pr-4 py-3 text-lg font-black bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground tabular-nums"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Quick Presets</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[15000, 20000, 25000, 30000, 40000, 50000].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setFormData({ ...formData, monthly_salary: amt })}
                            className={clsx(
                              'px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer font-mono',
                              formData.monthly_salary === amt
                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                                : 'bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            ₹{(amt / 1000)}k
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* PIN card */}
                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                        <KeyRound className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-foreground">4-Digit POS Biller PIN</h4>
                        <p className="text-[11px] text-muted-foreground">Quick authentication at POS without full login</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2.5">
                        {[0, 1, 2, 3].map(idx => (
                          <div
                            key={idx}
                            className={clsx(
                              'w-4 h-4 rounded-full border-2 transition-all duration-200',
                              formData.biller_pin.length > idx
                                ? 'bg-primary border-primary scale-110 shadow-md'
                                : 'bg-transparent border-border'
                            )}
                          />
                        ))}
                      </div>
                      <div className="flex-1 relative">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="Enter 4 digits"
                          value={formData.biller_pin}
                          onChange={e => setFormData({ ...formData, biller_pin: e.target.value.replace(/\D/g, '') })}
                          className="w-full pl-9 pr-4 py-2.5 text-center text-xl font-black font-mono tracking-[0.4em] bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
                        />
                      </div>
                      {formData.biller_pin.length === 4 && (
                        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Set</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Leave blank if PIN authentication is not required for this employee.
                    </p>
                  </div>
                </div>
              )}

              {/* ── TAB 3: SYSTEM ACCESS & PERMISSIONS ── */}
              {modalTab === 'access' && (
                <div className="space-y-5 animate-in fade-in duration-200">

                  <div>
                    <h3 className="text-base font-extrabold text-foreground">System Access</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Optionally link a login account for POS or web dashboard access</p>
                  </div>

                  <div className={clsx(
                    'rounded-2xl border transition-all overflow-hidden',
                    formData.showSystemAccountSection ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-border/60 bg-muted/20'
                  )}>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'p-2 rounded-xl transition-colors',
                          formData.showSystemAccountSection ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                        )}>
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-extrabold text-foreground">System Login Account</h4>
                          <p className="text-[11px] text-muted-foreground">Allow sign-in via email & password</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.showSystemAccountSection}
                          onChange={e => setFormData({ ...formData, showSystemAccountSection: e.target.checked, accessToggleTouched: true })}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    {formData.showSystemAccountSection && (
                      <div className="px-4 pb-4 pt-2 border-t border-indigo-500/15 space-y-4 animate-in fade-in duration-200">
                        <div>
                          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-2">Access Level</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { role: 'STAFF', title: 'Staff', desc: 'Limited access — can view assigned data', icon: User },
                              { role: 'ADMIN', title: 'Admin', desc: 'Full access — inventory, reports & staff', icon: SlidersHorizontal },
                            ].map(r => {
                              const Icon = r.icon;
                              const isSelected = formData.user_role === r.role;
                              return (
                                <div
                                  key={r.role}
                                  onClick={() => setFormData(current => ({
                                    ...current,
                                    user_role: r.role as any,
                                    roleTouched: true,
                                    permissions: r.role === 'ADMIN' ? ['*'] : current.permissions.filter(permission => permission !== '*'),
                                    permissionsTouched: true,
                                  }))}
                                  className={clsx(
                                    'p-3 rounded-xl border transition-all cursor-pointer',
                                    isSelected
                                      ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/20'
                                      : 'bg-background border-border/50 hover:border-border hover:bg-muted/40'
                                  )}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <Icon className={clsx('w-3.5 h-3.5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                                      <span className="text-[11px] font-extrabold text-foreground">{r.title}</span>
                                    </div>
                                    {isSelected && <Check className="w-3 h-3 text-primary" />}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">{r.desc}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Password {formData.user_id && <span className="font-medium normal-case tracking-normal">(blank = keep current)</span>}
                          </label>
                          <div className="relative">
                            <Lock className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type={formData.showPassword ? 'text' : 'password'}
                              placeholder={formData.user_id ? 'Leave blank to keep current' : 'Minimum 8 characters'}
                              value={formData.password}
                              onChange={e => setFormData({ ...formData, password: e.target.value })}
                              className="w-full pl-9 pr-10 py-2.5 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, showPassword: !formData.showPassword })}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              {formData.showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-2">
                            Permissions
                          </label>
                          {formData.user_role === 'ADMIN' ? (
                            <p className="text-xs text-muted-foreground rounded-xl border border-border/60 bg-card px-3 py-2.5">
                              Admin accounts automatically have full access. Permission selections apply to Staff accounts.
                            </p>
                          ) : (
                            <PermissionSelector
                              selectedPermissions={formData.permissions}
                              onChange={(perms) => setFormData(current => ({ ...current, permissions: perms, permissionsTouched: true }))}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── FOOTER ACTIONS ── */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/10">
              <div className="flex items-center gap-1.5">
                {!formData.name.trim() ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="text-[11px] font-bold text-rose-500">Staff name is required</span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Ready to save</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveStaff}
                  disabled={saving || !formData.name.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-[0.98]"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{formData.staff_id ? 'Update Profile' : 'Save Employee'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ═══ MODAL: ADD TRANSACTION (ADVANCE / PAYOUT) ═══ */}
      <Modal isOpen={showTxnModal} onClose={() => setShowTxnModal(false)} closeButton={<RedCrossButton onClick={() => setShowTxnModal(false)} />} title="Record Staff Transaction">
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Transaction Type</label>
            <select
              value={txnData.type}
              onChange={e => setTxnData({ ...txnData, type: e.target.value as any })}
              className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
            >
              <option value="ADVANCE">Salary Advance (Paid to Staff)</option>
              <option value="SALARY_PAYMENT">Salary Payment (Payout)</option>
              <option value="BONUS">Bonus / Incentive (Owed to Staff)</option>
              <option value="DEDUCTION">Deduction (Deducted from Staff)</option>
              <option value="SALARY_ACCRUAL">Monthly Salary Accrual</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Amount (₹)</label>
            <input
              type="number"
              placeholder="Enter amount"
              value={txnData.amount || ''}
              onChange={e => setTxnData({ ...txnData, amount: Number(e.target.value) })}
              className="w-full px-4 py-2.5 text-base font-black bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground tabular-nums"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Payment Method</label>
            <select
              value={txnData.payment_method}
              onChange={e => setTxnData({ ...txnData, payment_method: e.target.value })}
              className="w-full px-3 py-2 text-xs font-bold bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
            >
              <option value="CASH">Cash (Deducts from Cash Drawer)</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="UPI">UPI / GPay / PhonePe</option>
              <option value="CARD">Card</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1">Notes / Remarks</label>
            <input
              type="text"
              placeholder="e.g. Festival advance"
              value={txnData.notes}
              onChange={e => setTxnData({ ...txnData, notes: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleAddTransaction}
              disabled={saving || txnData.amount <= 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Record Transaction'}
            </button>
          </div>
        </div>
      </Modal>

      {statusMessage && (
        <FloatToast
          message={statusMessage.text}
          type={statusMessage.type}
          onClose={() => setStatusMessage(null)}
        />
      )}

      <DataUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        defaultEntity="staff"
        allowedEntities={['staff']}
        hideEntityTabs={true}
        onImportSuccess={() => {
          fetchStaff();
          setStatusMessage({ text: 'Staff members imported successfully!', type: 'success' });
        }}
      />
    </div>
  );
}
