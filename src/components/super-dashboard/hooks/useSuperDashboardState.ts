import { useState } from 'react';
import { type TenantAdmin } from '../superDashboardTypes';

/**
 * State of the super admin dashboard: tenant admins and health, the create / edit tenant form and provisioning
 * progress, credential reveal, verification and cloud access dialogs, search / filters, and loading flags.
 */
export function useSuperDashboardState() {
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
  const [provisionProgress, setProvisionProgress] = useState(0);
  // WhatsApp Device Modal state
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  // Cloud Access modal state
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [selectedCloudTenant, setSelectedCloudTenant] = useState<TenantAdmin | null>(null);
  const [cloudAccessEnabled, setCloudAccessEnabled] = useState(true);
  const [cloudScheduleEnabled, setCloudScheduleEnabled] = useState(false);
  const [cloudManualOverride, setCloudManualOverride] = useState<'AUTO' | 'FORCE_ON' | 'FORCE_OFF'>('AUTO');
  const [cloudSchedules, setCloudSchedules] = useState<Array<{ id: string; startTime: string; endTime: string; daysOfWeek?: number[]; enabled: boolean }>>([]);
  const [savingCloudAccess, setSavingCloudAccess] = useState(false);
  const [cloudAccessMsg, setCloudAccessMsg] = useState('');

  return {
    admins, setAdmins, loading, setLoading, modalOpen, setModalOpen, editingAdmin, setEditingAdmin, shopName,
    setShopName, domainType, setDomainType, ownerName, setOwnerName, ownerEmail, setOwnerEmail, ownerPassword,
    setOwnerPassword, dbConnectionString, setDbConnectionString, neonMailId, setNeonMailId, neonPassword,
    setNeonPassword, showOwnerPassword, setShowOwnerPassword, testStatus, setTestStatus, testError, setTestError,
    formError, setFormError, connectionHealth, setConnectionHealth, checkingAll, setCheckingAll, revealedPasswords,
    setRevealedPasswords, revealedUrls, setRevealedUrls, unmaskedCredentials, setUnmaskedCredentials,
    verificationModalOpen, setVerificationModalOpen, verificationTenantId, setVerificationTenantId, verificationCode,
    setVerificationCode, verificationStatus, setVerificationStatus, verificationError, setVerificationError,
    copiedText, setCopiedText, searchQuery, setSearchQuery, domainFilter, setDomainFilter, statusFilter,
    setStatusFilter, sortBy, setSortBy, provisionStatus, setProvisionStatus, provisionLogs, setProvisionLogs,
    provisionProgress, setProvisionProgress, whatsappModalOpen, setWhatsappModalOpen, cloudModalOpen,
    setCloudModalOpen, selectedCloudTenant, setSelectedCloudTenant, cloudAccessEnabled, setCloudAccessEnabled,
    cloudScheduleEnabled, setCloudScheduleEnabled, cloudManualOverride, setCloudManualOverride, cloudSchedules,
    setCloudSchedules, savingCloudAccess, setSavingCloudAccess, cloudAccessMsg, setCloudAccessMsg,
  };
}

export type SuperDashboardState = ReturnType<typeof useSuperDashboardState>;
