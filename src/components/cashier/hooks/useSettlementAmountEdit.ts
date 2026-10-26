import type React from 'react';
import type { CashierInvoiceRow } from '../cashierTypes';

export interface UseSettlementAmountEditContext {
  getRawNet: (inv: CashierInvoiceRow) => number;
  pendingInvoices: CashierInvoiceRow[];
  rowDiscs: Record<string, number>;
  rowPluses: Record<string, number>;
  setRowDiscInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowDiscPercentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowDiscPercents: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setRowDiscs: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setRowNetInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowPluses: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setRowPlusInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowPlusPercentInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRowPlusPercents: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSplitBank: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitCard: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitCash: React.Dispatch<React.SetStateAction<number | "">>;
  setSplitModalInvoice: React.Dispatch<React.SetStateAction<CashierInvoiceRow | null>>;
  setSplitModalNet: React.Dispatch<React.SetStateAction<number>>;
  setSplitUpi: React.Dispatch<React.SetStateAction<number | "">>;
}

/**
 * Settlement amount editing: open the split-payment dialog for an invoice (`openSplitModal`), and keep each pending
 * row's discount (percent / flat), added amount (percent / flat) and net amount in step as any of them is edited.
 */
export function useSettlementAmountEdit(ctx: UseSettlementAmountEditContext) {
  const { getRawNet, pendingInvoices, rowDiscs, rowPluses, setRowDiscInputs, setRowDiscPercentInputs, setRowDiscPercents, setRowDiscs, setRowNetInputs, setRowPluses, setRowPlusInputs, setRowPlusPercentInputs, setRowPlusPercents, setSplitBank, setSplitCard, setSplitCash, setSplitModalInvoice, setSplitModalNet, setSplitUpi } = ctx;
  const openSplitModal = (inv: any) => {
    const rd = rowDiscs[inv.invoice_id] ?? 0;
    const plusVal = rowPluses[inv.invoice_id] ?? 0;
    const rawNet = getRawNet(inv);
    const net = rawNet < 0 ? rawNet + plusVal : Math.max(0, rawNet - rd);

    let existingSplit: any = null;
    if (inv.split_details) {
      try {
        existingSplit = typeof inv.split_details === 'string' ? JSON.parse(inv.split_details) : inv.split_details;
      } catch { /* ignore */ }
    }

    setSplitModalInvoice(inv);
    setSplitModalNet(net);

    if (existingSplit && (Number(existingSplit.cash) || Number(existingSplit.card) || Number(existingSplit.upi) || Number(existingSplit.bank_transfer || existingSplit.bank))) {
      setSplitCash(Number(existingSplit.cash) || '');
      setSplitCard(Number(existingSplit.card) || '');
      setSplitUpi(Number(existingSplit.upi) || '');
      setSplitBank(Number(existingSplit.bank_transfer || existingSplit.bank) || '');
    } else {
      setSplitCash(net);
      setSplitCard('');
      setSplitUpi('');
      setSplitBank('');
    }
  };

  const handleDiscPercentChange = (invoiceId: string, val: string) => {
    setRowDiscPercentInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowDiscInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const percent = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.max(0, rawNet);
    const flat = base && !isNaN(percent) ? Math.round(((base * percent) / 100) * 100) / 100 : 0;
    setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowDiscs((p) => ({ ...p, [invoiceId]: flat }));
  };

  const handleDiscFlatChange = (invoiceId: string, val: string) => {
    setRowDiscInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const flat = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.max(0, rawNet);
    const percent = base && !isNaN(flat) ? Math.round(((flat / base) * 100) * 100) / 100 : 0;
    setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowDiscs((p) => ({ ...p, [invoiceId]: Math.max(0, flat) }));
  };

  const handlePlusPercentChange = (invoiceId: string, val: string) => {
    setRowPlusPercentInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const percent = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.abs(rawNet);
    const flat = base && !isNaN(percent) ? Math.round(((base * percent) / 100) * 100) / 100 : 0;
    setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowPluses((p) => ({ ...p, [invoiceId]: flat }));
  };

  const handlePlusFlatChange = (invoiceId: string, val: string) => {
    setRowPlusInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowNetInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '') {
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const flat = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    const rawNet = inv ? getRawNet(inv) : 0;
    const base = Math.abs(rawNet);
    const percent = base && !isNaN(flat) ? Math.round(((flat / base) * 100) * 100) / 100 : 0;
    setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
    setRowPluses((p) => ({ ...p, [invoiceId]: isNaN(flat) ? 0 : flat }));
  };

  const handleNetChange = (invoiceId: string, val: string) => {
    setRowNetInputs((p) => ({ ...p, [invoiceId]: val }));
    setRowPlusInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowPlusPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowDiscInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });
    setRowDiscPercentInputs((p) => { const n = { ...p }; delete n[invoiceId]; return n; });

    if (val === '' || val === '-') {
      setRowDiscPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowDiscs((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPlusPercents((p) => ({ ...p, [invoiceId]: 0 }));
      setRowPluses((p) => ({ ...p, [invoiceId]: 0 }));
      return;
    }
    const netVal = parseFloat(val);
    const inv = pendingInvoices.find(i => i.invoice_id === invoiceId);
    if (!inv) return;

    const rawNet = getRawNet(inv);
    if (rawNet < 0) {
      if (!isNaN(netVal)) {
        const targetNet = netVal > 0 ? -netVal : netVal;
        const plusVal = Math.round((targetNet - rawNet) * 100) / 100;
        const base = Math.abs(rawNet);
        const percent = base ? Math.round(((plusVal / base) * 100) * 100) / 100 : 0;
        setRowPlusPercents((p) => ({ ...p, [invoiceId]: percent }));
        setRowPluses((p) => ({ ...p, [invoiceId]: plusVal }));
      }
    } else {
      if (rawNet && !isNaN(netVal)) {
        const flat = Math.max(0, Math.round((rawNet - netVal) * 100) / 100);
        const percent = Math.round(((flat / rawNet) * 100) * 100) / 100;
        setRowDiscPercents((p) => ({ ...p, [invoiceId]: percent }));
        setRowDiscs((p) => ({ ...p, [invoiceId]: flat }));
      }
    }
  };

  return { openSplitModal, handleDiscPercentChange, handleDiscFlatChange, handlePlusPercentChange, handlePlusFlatChange, handleNetChange };
}
