import type React from 'react';
import { type UpiPageConfig, saveUpiPageConfig } from '../../../utils/print/upiConfig';
import { defaultForm, type PaymentSource } from '../paymentMethodsTypes';
import { paymentSourcesApi } from '../../../data/paymentSources';
import type { PaymentMethodsState } from './usePaymentMethodsState';

export interface UsePaymentSourceActionsContext {
  loadSources: (silent?: boolean) => Promise<void>;
  showMessage: (text: string, type?: "success" | "error") => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  pmState: PaymentMethodsState;
}

/** Payment method actions: add / edit / save, default and enabled toggles, delete with confirmation, copy, UPI page toggles. */
export function usePaymentSourceActions(ctx: UsePaymentSourceActionsContext) {
  const { loadSources, showMessage, tenantId, userId, userName } = ctx;
  const { editing, form, setCopiedId, setDeleteConfirmOpen, setDeleteSaving, setEditing, setForm, setIsSaving, setSources, setSourceToDelete, setTogglingId, setUpiPageConfig, setView, sourceToDelete, togglingId, upiPageConfig } = ctx.pmState;
  const handleToggleUpiPage = async (pageKey: keyof UpiPageConfig) => {
    const updated = { ...upiPageConfig, [pageKey]: !upiPageConfig[pageKey] };
    setUpiPageConfig(updated);
    const names: Record<keyof UpiPageConfig, string> = {
      billing: 'Billing Page',
      settlement: 'Cash Settlement Page',
      sales_history: 'Sales History',
      scrap: 'Scrap Manager',
      mobile_billing: 'Mobile App Billing',
    };
    const ok = await saveUpiPageConfig(tenantId || '', updated);
    if (ok) {
      showMessage(`UPI account selection on ${names[pageKey]} ${updated[pageKey] ? 'Enabled' : 'Disabled'}`);
    } else {
      showMessage('Failed to save configuration', 'error');
    }
  };

  const copyToClipboard = (text: string, idKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(defaultForm);
    setView('form');
  };

  const openEdit = (s: PaymentSource) => {
    setEditing(s);
    setForm({
      name: s.name,
      type: s.type as 'UPI' | 'CARD' | 'BANK',
      bank_name: s.bank_name || '',
      account_number: s.account_number || '',
      holder_name: s.holder_name || '',
      upi_id: s.upi_id || '',
      opening_balance: String(s.opening_balance ?? 0),
      is_default: s.is_default === 1,
      is_enabled: s.is_enabled === 1,
      sort_order: s.sort_order ?? 0,
    });
    setView('form');
  };

  const saveSource = async () => {
    if (!form.name.trim()) {
      showMessage('Method name is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const res = await paymentSourcesApi.updateSource({
          ...editing,
          name: form.name.trim(),
          bank_name: form.bank_name.trim(),
          account_number: form.account_number.trim(),
          holder_name: form.holder_name.trim(),
          upi_id: form.upi_id.trim(),
          opening_balance: parseFloat(form.opening_balance) || 0,
          is_default: form.is_default,
          is_enabled: form.is_enabled,
          sort_order: Number(form.sort_order) || 0,
          tenant_id: tenantId,
        });
        if (!res.success) {
          showMessage(res.error || 'Failed to update payment method', 'error');
          return;
        }
        showMessage('Payment method updated successfully');
      } else {
        const res = await paymentSourcesApi.addSource({
          name: form.name.trim(),
          type: form.type,
          bank_name: form.bank_name.trim(),
          account_number: form.account_number.trim(),
          holder_name: form.holder_name.trim(),
          upi_id: form.upi_id.trim(),
          opening_balance: parseFloat(form.opening_balance) || 0,
          is_default: form.is_default,
          is_enabled: form.is_enabled,
          sort_order: Number(form.sort_order) || 0,
          tenant_id: tenantId,
          created_by: userId,
          created_by_name: userName,
        });
        if (!res.success) {
          showMessage(res.error || 'Failed to add payment method', 'error');
          return;
        }
        showMessage('Payment method added successfully');
      }
      setView('list');
      await loadSources();
    } catch (e) {
      showMessage((e as { message?: string } | null)?.message || 'Operation failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSourceDefault = async (s: PaymentSource, e: React.MouseEvent) => {
    e.stopPropagation();
    if (s.is_default === 1 || togglingId) return;
    setTogglingId(s.source_id);

    // Optimistic UI update for instantaneous responsiveness
    setSources(prev => prev.map(item => {
      if (item.type === s.type) {
        return { ...item, is_default: item.source_id === s.source_id ? 1 : 0 };
      }
      return item;
    }));

    try {
      const res = await paymentSourcesApi.updateSource({
        ...s,
        is_default: true,
        tenant_id: tenantId,
      });
      if (res.success) {
        showMessage(`"${s.name}" set as default payment method`);
        await loadSources(true);
      } else {
        await loadSources(true);
        showMessage(res.error || 'Failed to update default state', 'error');
      }
    } catch (err) {
      await loadSources(true);
      showMessage((err as { message?: string } | null)?.message || 'Failed to set default', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const toggleSourceEnabled = async (s: PaymentSource, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingId) return;
    const nextState = s.is_enabled !== 1;
    setTogglingId(s.source_id);

    // Optimistic UI update so toggle feels instant and doesn't flicker or unload the section
    setSources(prev => prev.map(item => item.source_id === s.source_id ? { ...item, is_enabled: nextState ? 1 : 0 } : item));

    try {
      const res = await paymentSourcesApi.updateSource({
        ...s,
        is_enabled: nextState,
        tenant_id: tenantId,
      });
      if (res.success) {
        showMessage(`"${s.name}" ${nextState ? 'enabled' : 'disabled'}`);
        await loadSources(true);
      } else {
        // Rollback optimistic update on error
        setSources(prev => prev.map(item => item.source_id === s.source_id ? { ...item, is_enabled: s.is_enabled } : item));
        showMessage(res.error || 'Failed to toggle state', 'error');
      }
    } catch (err) {
      // Rollback optimistic update on error
      setSources(prev => prev.map(item => item.source_id === s.source_id ? { ...item, is_enabled: s.is_enabled } : item));
      showMessage((err as { message?: string } | null)?.message || 'Failed to update state', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const deleteSource = (s: PaymentSource) => {
    setSourceToDelete(s);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteSource = async () => {
    if (!sourceToDelete) return;
    setDeleteSaving(true);
    try {
      const res = await paymentSourcesApi.deleteSource({ source_id: sourceToDelete.source_id, tenant_id: tenantId || '' });
      if (res.success) {
        showMessage('Payment method deleted');
        setDeleteConfirmOpen(false);
        setSourceToDelete(null);
        await loadSources(true);
      } else {
        showMessage(res.error || 'Failed to delete payment method', 'error');
      }
    } catch {
      showMessage('Delete failed', 'error');
    } finally {
      setDeleteSaving(false);
    }
  };

  return { handleToggleUpiPage, copyToClipboard, openAdd, openEdit, saveSource, toggleSourceDefault, toggleSourceEnabled, deleteSource, confirmDeleteSource };
}
