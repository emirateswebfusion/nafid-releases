import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { vatApi } from '../../../data/vat';
import { getSetting } from '../../../data/settings';
import { hasBridge } from '../../../data/client';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { serializeVat201Json } from '../../../utils/export/vat201JsonSerializer';
import { exportFtaAuditFile } from '../../../utils/export/ftaAuditFileExporter';
import { exportVat201ToExcel } from '../../../utils/export/vat201ExcelExporter';
import type { Vat201Report } from '../../../../electron/services/vatReportService';
import type { LocalVatFilingRow } from '../../../../electron/services/vatFilingService';
import type { ToastMessage } from '../../ui/FloatToast';

export type VatTabType = 'vat201' | 'emirates' | 'sales' | 'credit_notes' | 'purchases' | 'validation' | 'filings_guide';
export type VatPeriodType = 'month' | 'quarter' | 'custom';

export function useVatReport() {
  const { tenantId, shopName } = useAuthStore();
  const isUae = isUaeStore();

  const [activeTab, setActiveTab] = useState<VatTabType>('vat201');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [report, setReport] = useState<Vat201Report | null>(null);
  const [shopTrn, setShopTrn] = useState('');
  const [shopEmirate, setShopEmirate] = useState('DUBAI');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [periodType, setPeriodType] = useState<VatPeriodType>('quarter');

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(() => {
    const month = new Date().getMonth() + 1;
    if (month <= 3) return 'Q1';
    if (month <= 6) return 'Q2';
    if (month <= 9) return 'Q3';
    return 'Q4';
  });

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [filings, setFilings] = useState<LocalVatFilingRow[]>([]);
  const [loadingFilings, setLoadingFilings] = useState(false);

  // Compute date range
  const { fromDate, toDate } = useMemo(() => {
    if (periodType === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { fromDate: start, toDate: end };
    }
    if (periodType === 'quarter') {
      const year = new Date().getFullYear();
      let startM = 1;
      let endM = 3;
      if (selectedQuarter === 'Q2') { startM = 4; endM = 6; }
      else if (selectedQuarter === 'Q3') { startM = 7; endM = 9; }
      else if (selectedQuarter === 'Q4') { startM = 10; endM = 12; }
      const start = `${year}-${String(startM).padStart(2, '0')}-01`;
      const lastDay = new Date(year, endM, 0).getDate();
      const end = `${year}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { fromDate: start, toDate: end };
    }
    return { fromDate: customStart, toDate: customEnd };
  }, [periodType, selectedMonth, selectedQuarter, customStart, customEnd]);

  // Load shop settings
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [trnVal, emirateVal] = await Promise.all([
          getSetting({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
          getSetting({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        ]);
        if (mounted) {
          if (typeof trnVal === 'string' && trnVal) setShopTrn(trnVal);
          if (typeof emirateVal === 'string' && emirateVal) setShopEmirate(emirateVal);
        }
      } catch {
        // use fallback defaults
      }
    })();
    return () => { mounted = false; };
  }, [tenantId]);

  // Fetch VAT report
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasBridge('dbGetVatReport')) {
        if (!cancelled) {
          setErrorMessage('Desktop runtime bridge updating. Please restart Nafid POS to activate the database bridge.');
          setReport(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const res = await vatApi.getVatReport({
          tenant_id: tenantId || 'global',
          from_date: fromDate,
          to_date: toDate,
          shop_emirate: shopEmirate,
          shop_trn: shopTrn,
          shop_name: shopName || 'UAE Store',
        });

        if (cancelled) return;

        if ('error' in res) {
          setErrorMessage(res.error);
          setToast({ text: res.error, type: 'error' });
          setReport(null);
        } else {
          setReport(res);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(msg);
          setToast({ text: msg, type: 'error' });
          setReport(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, fromDate, toDate, shopEmirate, shopTrn, shopName, refreshIndex]);

  const handleRefresh = useCallback(() => {
    setRefreshIndex(prev => prev + 1);
  }, []);

  const loadFilings = useCallback(async () => {
    if (!hasBridge('dbGetLocalVatFilings')) return;
    setLoadingFilings(true);
    try {
      const res = await vatApi.getLocalVatFilings();
      if (Array.isArray(res)) {
        setFilings(res);
      }
    } catch (err) {
      console.error('Failed to load VAT local filings:', err);
    } finally {
      setLoadingFilings(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasBridge('dbGetLocalVatFilings')) return;
      try {
        const res = await vatApi.getLocalVatFilings();
        if (!cancelled && Array.isArray(res)) {
          setFilings(res);
        }
      } catch (err) {
        console.error('Failed to load VAT local filings:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  const currentPeriodKey = useMemo(() => {
    if (periodType === 'quarter') {
      const year = new Date().getFullYear();
      return `${year}-${selectedQuarter}`;
    }
    if (periodType === 'month') {
      return selectedMonth;
    }
    return `${customStart}_to_${customEnd}`;
  }, [periodType, selectedQuarter, selectedMonth, customStart, customEnd]);

  const currentFiling = useMemo(() => {
    return filings.find(f => f.period === currentPeriodKey && f.return_type === 'VAT201');
  }, [filings, currentPeriodKey]);

  const handleApproveFiling = useCallback(async (notes?: string) => {
    if (!report) return false;
    try {
      const res = await vatApi.upsertLocalVatFiling({
        id: currentFiling?.id,
        period: currentPeriodKey,
        return_type: 'VAT201',
        status: 'APPROVED',
        filing_mode: 'EMARATAX_PORTAL',
        net_output_vat: report.section1Output.totalOutputTax.netOutputVatDue,
        recoverable_input_vat: report.section2Input.totalInputTax.netInputVatRecoverable,
        net_vat_payable: report.netDue.netVatPayable,
        net_vat_status: report.netDue.status,
        summary_payload: serializeVat201Json(report),
        notes: notes || 'Approved for FTA EmaraTax submission',
        approved_by: shopName || 'Authorized Signatory',
        approved_at: new Date().toISOString(),
      });
      if ('error' in res) {
        console.error('Failed to approve filing:', res.error);
        setToast({ text: res.error, type: 'error' });
        return false;
      }
      await loadFilings();
      setToast({ text: 'VAT 201 return approved for filing', type: 'success' });
      return true;
    } catch (err) {
      console.error('Failed to approve filing:', err);
      setToast({ text: err instanceof Error ? err.message : 'Failed to approve filing', type: 'error' });
      return false;
    }
  }, [report, currentFiling, currentPeriodKey, shopName, loadFilings]);

  const handleRecordEmaraTaxAck = useCallback(async (payload: {
    acknowledgementNumber: string;
    filingDate: string;
    notes?: string;
  }) => {
    if (!report) return false;
    try {
      const res = await vatApi.recordLocalVatManualAck({
        id: currentFiling?.id,
        period: currentPeriodKey,
        return_type: 'VAT201',
        filing_mode: 'EMARATAX_PORTAL',
        acknowledgement_number: payload.acknowledgementNumber,
        filing_date: payload.filingDate,
        net_output_vat: report.section1Output.totalOutputTax.netOutputVatDue,
        recoverable_input_vat: report.section2Input.totalInputTax.netInputVatRecoverable,
        net_vat_payable: report.netDue.netVatPayable,
        net_vat_status: report.netDue.status,
        notes: payload.notes,
        approved_by: shopName || 'Authorized Signatory',
        approved_at: new Date().toISOString(),
      });
      if ('error' in res) {
        console.error('Failed to record EmaraTax ack:', res.error);
        setToast({ text: res.error, type: 'error' });
        return false;
      }
      await loadFilings();
      setToast({ text: `Filing acknowledgement recorded: ARN ${payload.acknowledgementNumber}`, type: 'success' });
      return true;
    } catch (err) {
      console.error('Failed to record EmaraTax ack:', err);
      setToast({ text: err instanceof Error ? err.message : 'Failed to record acknowledgement', type: 'error' });
      return false;
    }
  }, [report, currentFiling, currentPeriodKey, shopName, loadFilings]);

  const handleExportJson = useCallback(() => {
    if (!report) return;
    try {
      const jsonStr = serializeVat201Json(report);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VAT_201_${report.period.fromDate}_to_${report.period.toDate}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ text: 'VAT 201 JSON exported successfully', type: 'success' });
    } catch (err) {
      console.error('Failed to export VAT 201 JSON:', err);
      setToast({ text: 'Failed to export VAT 201 JSON', type: 'error' });
    }
  }, [report]);

  const handleExportFaf = useCallback(() => {
    if (!report) return;
    try {
      const fafText = exportFtaAuditFile(report);
      const blob = new Blob([fafText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FTA_Audit_File_${report.taxablePerson.trn || 'TRN'}_${report.period.fromDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ text: 'FTA Audit File (FAF) exported successfully', type: 'success' });
    } catch (err) {
      console.error('Failed to export FTA Audit File (FAF):', err);
      setToast({ text: 'Failed to export FTA Audit File (FAF)', type: 'error' });
    }
  }, [report]);

  const handleExportExcel = useCallback(() => {
    if (!report) return;
    try {
      exportVat201ToExcel(report);
      setToast({ text: 'VAT 201 Excel workbook exported successfully', type: 'success' });
    } catch (err) {
      console.error('Failed to export VAT Excel:', err);
      setToast({ text: 'Failed to export VAT Excel', type: 'error' });
    }
  }, [report]);

  return {
    isUae,
    shopName,
    shopTrn,
    shopEmirate,
    activeTab,
    setActiveTab,
    loading,
    errorMessage,
    toast,
    setToast,
    report,
    periodType,
    setPeriodType,
    selectedMonth,
    setSelectedMonth,
    selectedQuarter,
    setSelectedQuarter,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    fromDate,
    toDate,
    filings,
    loadingFilings,
    currentPeriodKey,
    currentFiling,
    handleApproveFiling,
    handleRecordEmaraTaxAck,
    handleRefresh,
    handleExportJson,
    handleExportFaf,
    handleExportExcel,
  };
}
