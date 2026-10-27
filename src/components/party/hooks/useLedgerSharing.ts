import { isLedgerRecipientAllowed } from '../../../data/whatsappSharing';
import { hasBridge } from '../../../data/client';
import { formatWhatsAppLedgerTxMessage, formatWhatsAppStatementMessage } from '../../../utils/print/whatsappBillHelper';
import { whatsappApi } from '../../../data/whatsapp';
import { generatePartyLedgerHtml } from '../../../utils/print/partyLedgerPdfGenerator';
import { getStoreTimezone } from '../../../utils/time/timezoneHelper';
import { printingApi } from '../../../data/printing';
import type { StatementReconciliation } from '../../../utils/print/partyLedgerPdfGenerator';
import type { TerminologyLabels } from '../../../store/terminologyStore';
import type { LedgerEntry } from '../partyTypes';
import type { PartyManagerState } from './usePartyManagerState';

export interface UseLedgerSharingContext {
  shopName: string | null;
  showStatus: (text: string, type: "success" | "error") => void;
  statementData: StatementReconciliation | null;
  tenantId: string | null;
  tLabels: TerminologyLabels;
  pm: PartyManagerState;
}

/**
 * Share a party ledger: send one entry on WhatsApp, download the ledger as PDF, or send the PDF on WhatsApp.
 */
export function useLedgerSharing(ctx: UseLedgerSharingContext) {
  const { shopName, showStatus, statementData, tenantId, tLabels } = ctx;
  const { enablePartyEstimate, enablePartyGst, ledger, ledgerBalanceFilter, ledgerEndDate, ledgerStartDate, ledgerWhatsappIncludeShop, selectedParty, setIsExportingPdf, setIsSendingWhatsAppPdf, shopDetails } = ctx.pm;
  const handleSendWhatsAppForEntry = async (entry: LedgerEntry) => {
    if (!selectedParty) return;
    const phone = (selectedParty.phone || '').trim();
    if (!phone) {
      showStatus('WhatsApp alert not sent: Party phone number is missing', 'error');
      return;
    }
    if (!hasBridge('whatsappSendInvoice')) {
      showStatus('WhatsApp service not available', 'error');
      return;
    }

    try {
      if (!await isLedgerRecipientAllowed(tenantId || 'global', selectedParty)) {
        showStatus('This party type is excluded in WhatsApp settings', 'error');
        return;
      }
      const amt = Number(entry.credit_amount > 0 ? entry.credit_amount : entry.debit_amount) || 0;
      const runningBal = Number(entry.running_balance) || 0;
      const ob = runningBal - (Number(entry.credit_amount) || 0) + (Number(entry.debit_amount) || 0);

      const effectiveShopName = shopDetails.shopName || shopName || '';
      const waMsg = formatWhatsAppLedgerTxMessage({
        openingBalance: ob,
        amount: amt,
        newBalance: runningBal,
        paymentMethod: entry.payment_method || 'CASH',
        description: entry.description,
        transactionType: entry.credit_amount > 0 ? 'CREDIT' : 'DEBIT',
        partyName: selectedParty.name,
        shopName: effectiveShopName,
        includeShopName: ledgerWhatsappIncludeShop,
      });

      const res = await whatsappApi.sendInvoice({
        phone,
        message: waMsg,
      });

      if (res?.success) {
        showStatus(`WhatsApp alert sent to ${selectedParty.name}!`, 'success');
      } else {
        showStatus(`WhatsApp Alert Failed: ${res?.error || 'WhatsApp not able to connect'}`, 'error');
      }
    } catch (err) {
      showStatus('WhatsApp Alert Failed: ' + ((err as Error)?.message || 'Connection error'), 'error');
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedParty || !statementData) return;
    setIsExportingPdf(true);
    try {
      let effectiveLedgerForPdf = ledger;
      if (enablePartyGst && !enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === 'GST');
      } else if (!enablePartyGst && enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => e.balance_type === 'ESTIMATE');
      } else if (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL') {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === ledgerBalanceFilter);
      }
      const partyWithLedger = { ...selectedParty, ledger: effectiveLedgerForPdf };
      const effectiveShopName = shopDetails.shopName || shopName || 'STORE';
      const htmlContent = generatePartyLedgerHtml({
        shopName: effectiveShopName,
        shopAddress: shopDetails.shopAddress || undefined,
        shopPhone: shopDetails.shopPhone || undefined,
        shopEmail: shopDetails.shopEmail || undefined,
        shopGstin: shopDetails.shopGstin || undefined,
        shopState: shopDetails.shopState || undefined,
        party: partyWithLedger,
        filter: { startDate: ledgerStartDate, endDate: ledgerEndDate },
        terminology: tLabels,
        timezone: getStoreTimezone(),
        showBalanceType: enablePartyGst && enablePartyEstimate,
      });

      const pClean = selectedParty.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const startTag = ledgerStartDate || 'Beginning';
      const endTag = ledgerEndDate || 'Current';
      const defaultFilename = `Statement_${pClean}_${startTag}_to_${endTag}.pdf`;

      if (hasBridge('exportA4Pdf')) {
        const res = await printingApi.exportA4Pdf(
          tenantId || 'global',
          htmlContent,
          defaultFilename,
          { displayHeaderFooter: true }
        );
        if (res?.success) {
          if (!res.canceled) {
            showStatus(`Statement PDF downloaded successfully!`, 'success');
          }
        } else if (res?.error) {
          showStatus(`PDF export error: ${res.error}`, 'error');
        }
      } else {
        const pw = window.open('', '_blank');
        if (pw) {
          pw.document.write(htmlContent);
          pw.document.title = defaultFilename.replace('.pdf', '');
          pw.document.close();
          setTimeout(() => pw.print(), 500);
        }
      }
    } catch (err) {
      console.error('Download PDF error:', err);
      showStatus('Failed to generate PDF: ' + ((err as Error)?.message || 'Unknown error'), 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSendWhatsAppPdf = async () => {
    if (!selectedParty || !statementData) return;
    const phone = (selectedParty.phone || '').trim();
    if (!phone) {
      showStatus('WhatsApp alert not sent: Party phone number is missing', 'error');
      return;
    }
    setIsSendingWhatsAppPdf(true);
    try {
      if (!await isLedgerRecipientAllowed(tenantId || 'global', selectedParty)) {
        showStatus('This party type is excluded in WhatsApp settings', 'error');
        return;
      }
      let effectiveLedgerForPdf = ledger;
      if (enablePartyGst && !enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === 'GST');
      } else if (!enablePartyGst && enablePartyEstimate) {
        effectiveLedgerForPdf = ledger.filter(e => e.balance_type === 'ESTIMATE');
      } else if (enablePartyGst && enablePartyEstimate && ledgerBalanceFilter !== 'ALL') {
        effectiveLedgerForPdf = ledger.filter(e => (e.balance_type || 'GST') === ledgerBalanceFilter);
      }
      const partyWithLedger = { ...selectedParty, ledger: effectiveLedgerForPdf };
      const effectiveShopName = shopDetails.shopName || shopName || 'STORE';
      const htmlContent = generatePartyLedgerHtml({
        shopName: effectiveShopName,
        shopAddress: shopDetails.shopAddress || undefined,
        shopPhone: shopDetails.shopPhone || undefined,
        shopEmail: shopDetails.shopEmail || undefined,
        shopGstin: shopDetails.shopGstin || undefined,
        shopState: shopDetails.shopState || undefined,
        party: partyWithLedger,
        filter: { startDate: ledgerStartDate, endDate: ledgerEndDate },
        terminology: tLabels,
        timezone: getStoreTimezone(),
        showBalanceType: enablePartyGst && enablePartyEstimate,
      });

      const pClean = selectedParty.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const startTag = ledgerStartDate || 'Beginning';
      const endTag = ledgerEndDate || 'Current';
      const defaultFilename = `Statement_${pClean}_${startTag}_to_${endTag}.pdf`;

      const summaryMsg = formatWhatsAppStatementMessage({
        shopName: effectiveShopName,
        partyName: selectedParty.name,
        partyType: selectedParty.party_type || 'Customer',
        phone: selectedParty.phone,
        balance: statementData.closingBalance,
        balanceLabel: statementData.closingBalance > 0 ? tLabels.receivable : statementData.closingBalance < 0 ? tLabels.payable : 'Settled',
        totalDebit: statementData.periodDebit,
        totalCredit: statementData.periodCredit,
        entryCount: statementData.entryCount,
        lastDate: statementData.periodLabel,
      });

      if (hasBridge('whatsappSendInvoice')) {
        const res = await whatsappApi.sendInvoice({
          phone,
          message: summaryMsg,
          htmlContent,
          fileName: defaultFilename,
        });
        if (res?.success) {
          showStatus(`Statement PDF sent to ${selectedParty.name} via WhatsApp!`, 'success');
        } else {
          showStatus(`WhatsApp Alert Failed: ${res?.error || 'Could not send WhatsApp message'}`, 'error');
        }
      } else {
        const waUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(summaryMsg)}`;
        window.open(waUrl, '_blank');
        showStatus('Opened WhatsApp chat with statement summary', 'success');
      }
    } catch (err) {
      showStatus('WhatsApp Alert Failed: ' + ((err as Error)?.message || 'Connection error'), 'error');
    } finally {
      setIsSendingWhatsAppPdf(false);
    }
  };

  return { handleSendWhatsAppForEntry, handleDownloadPdf, handleSendWhatsAppPdf };
}
