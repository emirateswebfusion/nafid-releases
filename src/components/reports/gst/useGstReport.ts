import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { gstApi } from '../../../data/gst';
import { getSetting } from '../../../data/settings';
import { hasBridge } from '../../../data/client';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { serializeGstr1Json } from '../../../utils/export/gstr1JsonSerializer';
import { exportGstr1ToExcel } from '../../../utils/export/gstr1ExcelExporter';
import type { Gstr1Report } from '../../../../electron/services/gstReportService';
import type { ToastMessage } from '../../ui/FloatToast';

export type GstTabType = 'summary' | 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'hsn' | 'doc_issue' | 'gstr3b' | 'validation' | 'filing' | 'settings';
export type GstPeriodType = 'month' | 'quarter' | 'custom';

export function useGstReport() {
  const { tenantId, shopName } = useAuthStore();
  const isUae = isUaeStore();

  const [activeTab, setActiveTab] = useState<GstTabType>('summary');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [report, setReport] = useState<Gstr1Report | null>(null);
  const [shopGstin, setShopGstin] = useState('');
  const [shopState, setShopState] = useState('32'); // Default Kerala (32)

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [periodType, setPeriodType] = useState<GstPeriodType>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(() => {
    const month = new Date().getMonth() + 1;
    if (month <= 3) return 'Q4'; // Previous fiscal Q4 or calendar
    if (month <= 6) return 'Q1';
    if (month <= 9) return 'Q2';
    return 'Q3';
  });
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [refreshIndex, setRefreshIndex] = useState(0);

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
        const [gstin, state] = await Promise.all([
          getSetting({ tenant_id: tenantId || 'global', key: 'shop_gstin' }),
          getSetting({ tenant_id: tenantId || 'global', key: 'shop_state' }),
        ]);
        if (mounted) {
          if (typeof gstin === 'string' && gstin) setShopGstin(gstin);
          if (typeof state === 'string' && state) setShopState(state);
        }
      } catch {
        // use fallback defaults
      }
    })();
    return () => { mounted = false; };
  }, [tenantId]);

  // Fetch GST report
  useEffect(() => {
    let cancelled = false;
    if (isUae) return;

    (async () => {
      if (!hasBridge('dbGetGstReport')) {
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
        const res = await (gstApi.getGstReport as (args: unknown) => Promise<Gstr1Report | { error: string }>)({
          tenant_id: tenantId || 'global',
          from_date: fromDate,
          to_date: toDate,
          shop_state_code: shopGstin ? shopGstin.slice(0, 2) : shopState,
        });
        if (cancelled) return;
        if ('error' in res) {
          console.error('[GstReport] Load error:', res.error);
          setErrorMessage(res.error);
          setReport(null);
        } else {
          setReport(res);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[GstReport] Unexpected fetch error:', err);
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setReport(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isUae, tenantId, fromDate, toDate, shopGstin, shopState, refreshIndex]);

  const handleRefresh = useCallback(() => {
    setRefreshIndex(i => i + 1);
  }, []);

  const handleExportJson = useCallback(() => {
    if (!report) return;
    try {
      const gstin = shopGstin || (report.b2b[0]?.gstin ? report.b2b[0].gstin.slice(0, 2) + 'AAAAA0000A1Z5' : '32AAAAA0000A1Z5');
      const jsonPayload = serializeGstr1Json(
        gstin,
        report.summary,
        report.b2b,
        report.b2cl,
        report.b2cs,
        report.cdnr,
        report.cdnur,
        report.hsn,
        report.doc_issue,
      );
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(jsonPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `GSTR1_${fromDate}_to_${toDate}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setToast({ text: 'GSTR-1 Portal JSON exported successfully', type: 'success' });
    } catch (err) {
      console.error('Failed to export GSTR-1 JSON:', err);
      setToast({ text: 'Failed to export GSTR-1 JSON', type: 'error' });
    }
  }, [report, shopGstin, fromDate, toDate]);

  const handleExportExcel = useCallback(() => {
    if (!report) return;
    try {
      exportGstr1ToExcel(report, `GSTR1_${fromDate}_to_${toDate}.xlsx`);
      setToast({ text: 'GSTR-1 Excel workbook exported successfully', type: 'success' });
    } catch (err) {
      console.error('Failed to export GSTR-1 Excel:', err);
      setToast({ text: 'Failed to export GSTR-1 Excel', type: 'error' });
    }
  }, [report, fromDate, toDate]);

  return {
    isUae,
    tenantId,
    shopName,
    shopGstin,
    setShopGstin,
    shopState,
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
    handleRefresh,
    handleExportJson,
    handleExportExcel,
  };
}
