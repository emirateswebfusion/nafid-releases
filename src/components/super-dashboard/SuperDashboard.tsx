import { useState, useMemo } from 'react';
import { ManagedGspModal } from './views/ManagedGspModal';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { Store, Wrench, Gem, ShoppingBag } from 'lucide-react';
import { SuperAdminWhatsAppModal } from './SuperAdminWhatsAppModal';
import { useSuperDashboardState } from './hooks/useSuperDashboardState';
import { useCloudAccessActions } from './hooks/useCloudAccessActions';
import { useTenantAdmins } from './hooks/useTenantAdmins';
import { useTenantProvisioning } from './hooks/useTenantProvisioning';
import { useTenantVerification } from './hooks/useTenantVerification';
import { CloudAccessModal } from './views/CloudAccessModal';
import { VerificationCodeModal } from './views/VerificationCodeModal';
import { TenantFormModal } from './views/TenantFormModal';
import { TenantTable } from './views/TenantTable';
import { TenantFilterBar } from './views/TenantFilterBar';
import { SuperDashboardStats } from './views/SuperDashboardStats';
import { SuperDashboardHeader } from './views/SuperDashboardHeader';

export default function SuperDashboard() {
  const { userName, logout } = useAuthStore();
  const [managedGspModalOpen, setManagedGspModalOpen] = useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const sd = useSuperDashboardState();
  const {
    admins, modalOpen, connectionHealth, setRevealedPasswords, setRevealedUrls, verificationModalOpen,
    setCopiedText, searchQuery, domainFilter, statusFilter, sortBy, whatsappModalOpen,
    setWhatsappModalOpen, cloudModalOpen, selectedCloudTenant,
  } = sd;

  

  

  const { handleOpenCloudAccessModal, handleAddScheduleWindow, handleRemoveScheduleWindow, handleUpdateScheduleWindow, handleSaveCloudAccess } = useCloudAccessActions({
    sd,
  });

  const { fetchAdmins, checkAllHealth } = useTenantAdmins({
    sd,
  });

  const { handleTestConnection, handleOpenCreateModal, handleOpenEditModal, handleExecuteProvisioning } = useTenantProvisioning({
    sd, fetchAdmins,
  });

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

  const { handleRequestVerificationCode, handleVerifyCode } = useTenantVerification({
    sd,
  });

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
      <SuperDashboardHeader
        handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} userName={userName}
        onOpenManagedGsp={() => setManagedGspModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {/* Statistics Hero Grid */}
        <SuperDashboardStats
          stats={stats}
        />

        {/* Search, Filters, and Operations bar */}
        <TenantFilterBar
          checkAllHealth={checkAllHealth} handleOpenCreateModal={handleOpenCreateModal} sd={sd}
        />

        {/* Tenant Table */}
        <TenantTable
          filteredAdmins={filteredAdmins} getDomainIcon={getDomainIcon} getDomainName={getDomainName}
          handleCopy={handleCopy} handleOpenCloudAccessModal={handleOpenCloudAccessModal}
          handleOpenEditModal={handleOpenEditModal} togglePasswordReveal={togglePasswordReveal}
          toggleUrlReveal={toggleUrlReveal} sd={sd}
        />
      {modalOpen && (
        <TenantFormModal
          handleExecuteProvisioning={handleExecuteProvisioning} handleTestConnection={handleTestConnection} sd={sd}
        />
      )}

      {/* Verification Code Modal */}
      {verificationModalOpen && (
        <VerificationCodeModal
          handleRequestVerificationCode={handleRequestVerificationCode} handleVerifyCode={handleVerifyCode} sd={sd}
        />
      )}

      {/* Super Admin Cloud Access & Schedule Control Modal */}
      {cloudModalOpen && selectedCloudTenant && (
        <CloudAccessModal
          handleAddScheduleWindow={handleAddScheduleWindow} handleRemoveScheduleWindow={handleRemoveScheduleWindow}
          handleSaveCloudAccess={handleSaveCloudAccess} handleUpdateScheduleWindow={handleUpdateScheduleWindow} selectedCloudTenant={selectedCloudTenant} sd={sd}
        />
      )}

      {/* Super Admin WhatsApp Device Pairing Modal */}
      <SuperAdminWhatsAppModal
        isOpen={whatsappModalOpen}
        onClose={() => setWhatsappModalOpen(false)}
      />

      {/* Super Admin Managed GSP Modal */}
      <ManagedGspModal
        isOpen={managedGspModalOpen}
        onClose={() => setManagedGspModalOpen(false)}
      />
      </main>
    </div>
  );
}

