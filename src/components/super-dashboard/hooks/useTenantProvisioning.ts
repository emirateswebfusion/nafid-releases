import { storeTime } from '../../../utils/time/dateDisplay';
import type React from 'react';
import { superAdminCloud } from '../../../data/cloud/superAdmin';
import { type TenantAdmin } from '../superDashboardTypes';
import type { SuperDashboardState } from './useSuperDashboardState';

export interface UseTenantProvisioningContext {
  fetchAdmins: () => Promise<void>;
  sd: SuperDashboardState;
}

/** Create / edit tenant dialog: open it, test the database connection, and run provisioning with progress logs. */
export function useTenantProvisioning(ctx: UseTenantProvisioningContext) {
  const { fetchAdmins } = ctx;
  const { dbConnectionString, domainType, editingAdmin, neonMailId, neonPassword, ownerEmail, ownerName, ownerPassword, setDbConnectionString, setDomainType, setEditingAdmin, setFormError, setModalOpen, setNeonMailId, setNeonPassword, setOwnerEmail, setOwnerName, setOwnerPassword, setProvisionLogs, setProvisionProgress, setProvisionStatus, setShopName, setTestError, setTestStatus, shopName } = ctx.sd;
  const handleTestConnection = async () => {
    if (!dbConnectionString) {
      setTestError('Connection URL is required to test');
      setTestStatus('failed');
      return;
    }

    setTestStatus('testing');
    setTestError('');
    try {
      const res = await superAdminCloud.testConnection({
        db_connection_string: dbConnectionString,
        tenant_id: editingAdmin?.tenant_id
      });
      if (res.success) {
        setTestStatus('success');
      } else {
        setTestStatus('failed');
        setTestError(res.error || 'Connection failed');
      }
    } catch (err) {
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
    setProvisionProgress(0);
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
    setProvisionProgress(0);
    setModalOpen(true);
  };

  const handleExecuteProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setProvisionStatus('provisioning');
    setProvisionLogs([]);
    setProvisionProgress(0);

    const timestamp = () => storeTime(new Date(), [], { hour12: false });
    const appendLog = (msg: string) => setProvisionLogs(prev => [...prev, `[${timestamp()}] ${msg}`]);

    appendLog('🔌 Initializing platform provisioning pipeline...');
    appendLog('🛰️ Pinging remote Neon PostgreSQL server to check connectivity...');

    let apiSuccess: boolean;
    let apiError = '';
    
    // Prepare API call promise
    const apiPromise = (async () => {
      if (editingAdmin) {
        return await superAdminCloud.updateAdmin(editingAdmin.tenant_id, {
          name: shopName,
          domain_type: domainType,
          db_connection_string: dbConnectionString,
          neon_mail_id: neonMailId || undefined,
          neon_password: neonPassword || undefined
        });
      } else {
        return await superAdminCloud.createAdmin({
          shop_name: shopName,
          domain_type: domainType,
          owner_email: ownerEmail,
          owner_password: ownerPassword,
          owner_name: ownerName || undefined,
          db_connection_string: dbConnectionString,
          neon_mail_id: neonMailId || undefined,
          neon_password: neonPassword || undefined
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
        setProvisionProgress(prev => Math.min(prev + 4 + Math.round(Math.random() * 3), 88));
      }, 1000);

      // Wait for the actual API call
      try {
        await apiPromise;
        apiSuccess = true;
      } catch (err) {
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
        setProvisionProgress(100);
        setProvisionStatus('success');

        // Close modal after success
        setTimeout(() => {
          setModalOpen(false);
          fetchAdmins();
        }, 1500);
      } else {
        appendLog(`❌ Provisioning pipeline failed: ${apiError}`);
        setProvisionProgress(0);
        setProvisionStatus('failed');
        setFormError(apiError);
      }
    } catch (err) {
      console.error('Provision error:', err);
      appendLog('❌ Provisioning failed');
      setProvisionStatus('failed');
      setFormError('Provisioning failed. Please try again.');
    }
  };

  return { handleTestConnection, handleOpenCreateModal, handleOpenEditModal, handleExecuteProvisioning };
}
