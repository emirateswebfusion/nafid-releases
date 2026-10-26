import { useState } from 'react';
import { type ShopClosingOverviewConfig, DEFAULT_SHOP_CLOSING_CONFIG } from '../../../utils/shopClosingHelper';
import { type WhatsAppStatus, type ClosingHistoryRow } from '../whatsAppTypes';

/**
 * State of the WhatsApp settings screen: device connection (status, QR, phone), ledger alert options, disconnect
 * confirmation, shop closing report config / preview / history, and loading / saving flags.
 */
export function useWhatsAppSettingsState() {
  const [internalClosingConfig, setInternalClosingConfig] = useState<ShopClosingOverviewConfig>(DEFAULT_SHOP_CLOSING_CONFIG);
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [ledgerAlertsEnabled, setLedgerAlertsEnabled] = useState<boolean>(true);
  const [includeShopName, setIncludeShopName] = useState<boolean>(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState<boolean>(false);
  // ── Shop Closing Overview State ──────────────────────────────────────────
  const [, setLoadingClosing] = useState<boolean>(false);
  const [savingClosing, setSavingClosing] = useState<boolean>(false);
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [closingHistory, setClosingHistory] = useState<ClosingHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  return {
    internalClosingConfig, setInternalClosingConfig, status, setStatus, qrCode, setQrCode, phone, setPhone, loading,
    setLoading, msg, setMsg, ledgerAlertsEnabled, setLedgerAlertsEnabled, includeShopName, setIncludeShopName,
    showConfirmDisconnect, setShowConfirmDisconnect, setLoadingClosing, savingClosing, setSavingClosing, sendingTest,
    setSendingTest, previewText, setPreviewText, previewLoading, setPreviewLoading, closingHistory,
    setClosingHistory, loadingHistory, setLoadingHistory, retryingId, setRetryingId, showHistory, setShowHistory,
  };
}

export type WhatsAppSettingsState = ReturnType<typeof useWhatsAppSettingsState>;
