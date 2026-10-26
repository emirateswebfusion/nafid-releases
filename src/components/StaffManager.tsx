import { useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { Users, UserPlus, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { DataUploadModal } from './DataUploadModal';
import { RedCrossButton } from './ui/RedCrossButton';
import { FloatToast } from './ui/FloatToast';
import { formatWhatsAppStaffSalaryMessage } from '../utils/whatsappBillHelper';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape';
import { useFeatureFlagsStore } from '../featureFlags';
import { authApi } from '../data/auth';
import { hasBridge } from '../data/client';
import { settingsApi } from '../data/settings';
import { staffApi } from '../data/staff';
import { whatsappApi } from '../data/whatsapp';
import { staffCloud } from '../data/cloud/staffCloud';
import { type StaffMember, type SavedSystemAccount } from './staff/staffTypes';
import { useStaffManagerState } from './staff/hooks/useStaffManagerState';
import { StaffTransactionModal } from './staff/views/StaffTransactionModal';
import { StaffFormModal } from './staff/views/StaffFormModal';
import { StaffDetailPanel } from './staff/views/StaffDetailPanel';
import { StaffProfileHeader } from './staff/views/StaffProfileHeader';
import { StaffList } from './staff/views/StaffList';

export function StaffManager({ onClose }: { onClose: () => void }) {
  useCloseOnEscape(onClose);
  const { token, tenantId, userId } = useAuthStore();
  
  const sm = useStaffManagerState();
  const {
    staffList, setStaffList, selectedStaffId, setSelectedStaffId, setLoading, statusMessage,
    setStatusMessage, showUploadModal, setShowUploadModal, searchQuery, statusFilter, setShowAddModal,
    setShowTxnModal, setSaving, setModalTab, formData, setFormData, txnData,
    setTxnData, setLedgerEntries, setAttendanceRecords, selectedMonth, setIsSendingWhatsApp,
  } = sm;

  const { flags: featureFlags, loadFlags } = useFeatureFlagsStore();

  useEffect(() => {
    if (statusMessage) {
      const t = setTimeout(() => setStatusMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [statusMessage, setStatusMessage]);

  // Load Feature Flags for Attendance & Biller PIN
  useEffect(() => {
    loadFlags((tenantId || undefined) as string);
  }, [tenantId, loadFlags]);

  // Fetch Staff Directory
  const fetchStaff = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      if (hasBridge('dbGetStaff')) {
        const rows = await staffApi.getStaff({ tenant_id: tenantId, search: searchQuery, status: statusFilter });
        const list = Array.isArray(rows) ? rows : [];
        setStaffList(list);
        if (!selectedStaffId && list.length > 0) {
          setSelectedStaffId(list[0].staff_id);
        }
      } else {
        // Web fallback
        const res = await staffCloud.list(token, searchQuery, statusFilter);
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
    } catch (err) {
      console.error('[StaffManager] Failed to load staff members:', err);
      setStatusMessage({
        text: (err as Error)?.message ? `Failed to load staff members (${(err as Error).message})` : 'Failed to load staff members',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, searchQuery, statusFilter, token, selectedStaffId, setLoading, setSelectedStaffId, setStaffList, setStatusMessage]);

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
      if (hasBridge('dbGetStaffLedger')) {
        const ledger = await staffApi.getStaffLedger({ tenant_id: tenantId, staff_id: selectedStaffId });
        setLedgerEntries(Array.isArray(ledger) ? ledger : []);
      }
      if (hasBridge('dbGetStaffAttendance')) {
        const att = await staffApi.getStaffAttendance({ tenant_id: tenantId, staff_id: selectedStaffId, month: selectedMonth });
        setAttendanceRecords(Array.isArray(att) ? att : []);
      }
    } catch (err) {
      console.warn('[StaffManager] Error loading staff details:', err);
    }
  }, [selectedStaffId, tenantId, selectedMonth, setAttendanceRecords, setLedgerEntries]);

  useEffect(() => {
    loadStaffDetails();
  }, [loadStaffDetails]);

  // Handle Save Staff Member (Add / Edit)
  const fetchSystemAccounts = async () => {
    if (!token) return null;
    try {
      const response = await staffCloud.listAccounts(token);
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
      const response = await staffCloud.setLoginEnabled(token, formData.user_id, false);
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
    let matchingAccount: (SavedSystemAccount & { email?: string }) | null = null;
    const accounts = await fetchSystemAccounts();
    if (accounts) {
      matchingAccount = userId
        ? accounts.find((account) => account.user_id === userId) || null
        : null;
      if (userId && !matchingAccount) userId = '';
      if (!userId) {
        matchingAccount = accounts.find((account) => String(account.email || '').trim().toLowerCase() === email) || null;
      }
      if (matchingAccount) {
        const linkedStaff = staffList.find(staff => staff.user_id === matchingAccount!.user_id && staff.staff_id !== formData.staff_id);
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

    const role = matchingAccount && !formData.roleTouched
      ? (matchingAccount.role === 'ADMIN' ? 'ADMIN' : 'STAFF')
      : formData.user_role;
    const permissions = matchingAccount && !formData.permissionsTouched
      ? (Array.isArray(matchingAccount.permissions) ? matchingAccount.permissions : [])
      : formData.permissions;
    const response = await staffCloud.saveAccount(token, userId, {
      name: formData.name.trim(),
      email,
      password: formData.password || undefined,
      role,
      permissions,
      login_enabled: true,
    });
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
      user_role: (staff.user_role as typeof formData.user_role) || 'STAFF',
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
          ? users.find((user) => user.user_id === staff.user_id)
          : users.find((user) => String(user.email || '').trim().toLowerCase() === email);
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
    let savedStaff: Partial<StaffMember> | undefined;
    try {
      if (hasBridge('dbSaveStaff')) {
        savedStaff = await staffApi.saveStaff({
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
        const res = await staffCloud.saveStaff(token, {
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
          if (hasBridge('dbSaveStaff')) {
            await staffApi.saveStaff(linkedStaff);
          } else {
            const linkResponse = await staffCloud.saveStaff(token, linkedStaff);
            const linkResult = await linkResponse.json().catch(() => ({}));
            if (!linkResponse.ok) throw new Error(linkResult?.error || 'Login was saved but could not be linked to the staff profile');
          }
        }

        if (hasBridge('authSaveLocalUser') && accountUserId) {
          await authApi.saveLocalUser({
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
    } catch (err) {
      const message = (err as Error).message || 'Error saving staff record';
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

  const handleSendWhatsAppSalary = async () => {
    if (!selectedStaff) return;
    const phone = (selectedStaff.phone || '').trim();
    if (!phone) {
      setStatusMessage({ text: 'Staff member does not have a phone number saved', type: 'error' });
      return;
    }
    if (!hasBridge('whatsappSendInvoice')) {
      setStatusMessage({ text: 'WhatsApp service not available', type: 'error' });
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const shopNameVal = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'shop_name' });
      const storeName = shopNameVal || 'My Shop';

      const waMsg = formatWhatsAppStaffSalaryMessage({
        shopName: storeName,
        staffName: selectedStaff.name,
        staffCode: selectedStaff.staff_code,
        monthlySalary: selectedStaff.monthly_salary as number,
        currentBalance: selectedStaff.current_balance as number,
      });

      const res = await whatsappApi.sendInvoice({
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
      if (hasBridge('dbSaveStaff')) {
        await staffApi.saveStaff({
          staff_id: staffMember.staff_id,
          tenant_id: tenantId!,
          name: staffMember.name,
          status: newStatus,
        });
        setStatusMessage({ text: `${staffMember.name} marked as ${newStatus}`, type: 'success' });
        await fetchStaff();
      }
    } catch (err) {
      setStatusMessage({ text: (err as Error).message || 'Failed to update status', type: 'error' });
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
      if (hasBridge('dbSaveStaff')) {
        await staffApi.saveStaff(payload);
      } else {
        const response = await staffCloud.saveStaff(token, payload);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Failed to update monthly salary');
      }
      setStatusMessage({ text: `Monthly salary updated for ${selectedStaff.name}`, type: 'success' });
      await fetchStaff();
    } catch (err) {
      setStatusMessage({ text: (err as Error).message || 'Failed to update monthly salary', type: 'error' });
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
      if (hasBridge('dbAddStaffTransaction')) {
        const res = await staffApi.addStaffTransaction({
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
    } catch (err) {
      setStatusMessage({ text: (err as Error).message || 'Failed to add transaction', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Handle Save Attendance Record
  const handleMarkAttendance = async (staffId: string, date: string, status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY') => {
    if (!tenantId) return;
    try {
      if (hasBridge('dbSaveStaffAttendance')) {
        await staffApi.saveStaffAttendance({
          tenant_id: tenantId,
          staff_id: staffId,
          date,
          status,
          user_id: userId || undefined,
        });
        await loadStaffDetails();
      }
    } catch {
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
        <StaffList
          sm={sm}
        />

        {/* ── RIGHT PANEL: STAFF PROFILE & MODULE TABS ── */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {selectedStaff ? (
            <>
              {/* Staff Profile Overview Header */}
              <StaffProfileHeader
                featureFlags={featureFlags} handleSendWhatsAppSalary={handleSendWhatsAppSalary}
                handleToggleStatus={handleToggleStatus} openEditStaff={openEditStaff} selectedStaff={selectedStaff}
                sm={sm}
              />

              {/* Module Content */}
              <StaffDetailPanel
                featureFlags={featureFlags} handleMarkAttendance={handleMarkAttendance}
                handleSaveStaff={handleSaveStaff} handleUpdateMonthlySalary={handleUpdateMonthlySalary}
                selectedStaff={selectedStaff} sm={sm}
              />
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
      <StaffFormModal
        handleSaveStaff={handleSaveStaff} sm={sm}
      />

      {/* ═══ MODAL: ADD TRANSACTION (ADVANCE / PAYOUT) ═══ */}
      <StaffTransactionModal
        handleAddTransaction={handleAddTransaction} sm={sm}
      />

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
