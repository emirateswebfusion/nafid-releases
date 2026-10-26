import { useState } from 'react';
import { type StaffMember, type StaffLedgerRow, type StaffAttendanceRow } from '../staffTypes';

/**
 * State of the staff screen: staff list and selection, the add / edit staff form and its tabs, system login account,
 * ledger and attendance, salary and transaction dialogs, and loading / saving flags.
 */
export function useStaffManagerState() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
const [activeTab, setActiveTab] = useState<'directory' | 'salary' | 'payments' | 'ledger' | 'attendance'>('directory');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
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
  // Detail Data for Selected Staff
  const [ledgerEntries, setLedgerEntries] = useState<StaffLedgerRow[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  // Toggle Staff Active / Inactive Status
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  return {
    staffList, setStaffList, activeTab, setActiveTab, selectedStaffId, setSelectedStaffId, loading, setLoading,
    statusMessage, setStatusMessage, showUploadModal, setShowUploadModal, searchQuery, setSearchQuery, statusFilter,
    setStatusFilter, showAddModal, setShowAddModal, showTxnModal, setShowTxnModal, saving, setSaving, modalTab,
    setModalTab, formData, setFormData, txnData, setTxnData, ledgerEntries, setLedgerEntries, attendanceRecords,
    setAttendanceRecords, selectedMonth, setSelectedMonth, isSendingWhatsApp, setIsSendingWhatsApp,
  };
}

export type StaffManagerState = ReturnType<typeof useStaffManagerState>;
