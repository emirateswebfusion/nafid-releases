import type React from 'react';
import { fetchApi } from '../../../lib/api';
import type { SuperDashboardState } from './useSuperDashboardState';

export interface UseTenantVerificationContext {
  sd: SuperDashboardState;
}

/** Request and verify the code that unmasks a tenant's stored credentials. */
export function useTenantVerification(ctx: UseTenantVerificationContext) {
  const { setRevealedPasswords, setRevealedUrls, setUnmaskedCredentials, setVerificationCode, setVerificationError, setVerificationModalOpen, setVerificationStatus, setVerificationTenantId, verificationCode, verificationTenantId } = ctx.sd;
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
    } catch {
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
    } catch {
      setVerificationStatus('failed');
      setVerificationError('Invalid verification code');
    }
  };

  return { handleRequestVerificationCode, handleVerifyCode };
}
