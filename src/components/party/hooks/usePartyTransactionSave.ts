import type React from 'react';
import { partiesApi } from '../../../data/parties';
import { v4 as uuidv4 } from 'uuid';
import { cashierApi } from '../../../data/cashier';
import { formatWhatsAppLedgerTxMessage } from '../../../utils/whatsappBillHelper';
import { hasBridge } from '../../../data/client';
import { whatsappApi } from '../../../data/whatsapp';
import { toUtcIso } from '../partyFormat';
import type { PartyManagerState } from './usePartyManagerState';
import type { Party } from '../partyTypes';

export interface UsePartyTransactionSaveContext {
  getPartyBalance: (p: Party) => number;
  isOwner: boolean;
  loadLedger: (partyId: string) => Promise<void>;
  loadParties: () => Promise<Party[] | undefined>;
  shopName: string | null;
  showStatus: (text: string, type: "success" | "error") => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  pm: PartyManagerState;
}

/**
 * Save a ledger transaction for the selected party (new or edited entry), with its cash drawer entry and optional
 * WhatsApp notice.
 */
export function usePartyTransactionSave(ctx: UsePartyTransactionSaveContext) {
  const { getPartyBalance, isOwner, loadLedger, loadParties, shopName, showStatus, tenantId, userId, userName } = ctx;
  const { editingTx, enablePartyEstimate, enablePartyGst, ledgerWhatsappEnabled, ledgerWhatsappIncludeShop, selectedParty, setIsSavingTx, setSelectedParty, setView, shopDetails, txForm } = ctx.pm;
  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;
    if (!txForm.amount) { showStatus('Amount is required', 'error'); return; }
    if (!isOwner) { showStatus('Only owners can manage transactions', 'error'); return; }

    const parsedAmount = parseFloat(txForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { showStatus('Enter a valid positive amount', 'error'); return; }

    const effectiveBalanceType = (!enablePartyGst && enablePartyEstimate)
      ? 'ESTIMATE'
      : (enablePartyGst && !enablePartyEstimate)
      ? 'GST'
      : (!enablePartyGst && !enablePartyEstimate)
      ? 'GST'
      : txForm.balance_type;

    setIsSavingTx(true);
    try {
      if (editingTx) {
        await partiesApi.updatePartyLedgerEntry({
          ledger_id: editingTx.ledger_id,
          party_id: selectedParty.party_id,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: toUtcIso(txForm.transaction_date) ?? undefined,
          reference_number: txForm.reference_number.trim() || null,
          balance_type: effectiveBalanceType,
          payment_method: txForm.payment_method,
        });
        showStatus('Transaction updated', 'success');
      } else {
        await partiesApi.addPartyLedgerEntry({
          ledger_id: uuidv4(),
          party_id: selectedParty.party_id,
          tenant_id: tenantId,
          amount: parsedAmount,
          transaction_type: txForm.transaction_type,
          description: txForm.description.trim(),
          transaction_date: toUtcIso(txForm.transaction_date) || new Date().toISOString(),
          reference_number: txForm.reference_number.trim() || null,
          balance_type: effectiveBalanceType,
          payment_method: txForm.payment_method,
          created_by: userId,
          created_by_name: userName || undefined,
        });

        if (txForm.payment_method === 'CASH') {
          const cashType = txForm.transaction_type === 'CREDIT' ? 'CASH_OUT' : 'CASH_IN';
          await cashierApi.addTransaction({
            tenant_id: tenantId!,
            type: cashType,
            amount: parsedAmount,
            category: 'Party ' + (cashType === 'CASH_OUT' ? 'Payment' : 'Receipt'),
            notes: `${selectedParty.name} - ${txForm.description.trim()}`,
            user_id: userId!,
            user_name: userName || undefined,
          });
        }

        // WhatsApp notification handling
        const isPartyAlertEnabled = selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false;
        const shouldSendWa = Boolean(ledgerWhatsappEnabled && isPartyAlertEnabled && txForm.send_whatsapp);

        if (shouldSendWa) {
          const partyPhone = (selectedParty.phone || '').trim();
          if (!partyPhone) {
            showStatus('Transaction added. WhatsApp alert not sent: Party phone number is missing', 'error');
          } else {
            try {
              const ob = getPartyBalance(selectedParty);
              const creditAmt = txForm.transaction_type === 'CREDIT' ? parsedAmount : 0;
              const debitAmt = txForm.transaction_type === 'DEBIT' ? parsedAmount : 0;
              const nb = ob + creditAmt - debitAmt;
              const effectiveShopName = shopDetails.shopName || shopName || '';

              const waMsg = formatWhatsAppLedgerTxMessage({
                openingBalance: ob,
                amount: parsedAmount,
                newBalance: nb,
                paymentMethod: txForm.payment_method,
                transactionType: txForm.transaction_type,
                partyName: selectedParty.name,
                shopName: effectiveShopName,
                includeShopName: ledgerWhatsappIncludeShop,
              });

              if (hasBridge('whatsappSendInvoice')) {
                const waRes = await whatsappApi.sendInvoice({
                  phone: partyPhone,
                  message: waMsg,
                });
                if (!waRes?.success) {
                  showStatus(`Transaction added. WhatsApp Alert Failed: ${waRes?.error || 'WhatsApp not able to connect'}`, 'error');
                } else {
                  showStatus(`Transaction added & WhatsApp alert sent to ${selectedParty.name}!`, 'success');
                }
              } else {
                showStatus('Transaction added. WhatsApp service not available', 'error');
              }
            } catch (waErr: any) {
              console.error('[PartyManager] WhatsApp send error:', waErr);
              showStatus(`Transaction added. WhatsApp Alert Failed: ${waErr?.message || 'Connection error'}`, 'error');
            }
          }
        } else {
          showStatus('Transaction added', 'success');
        }
      }
      await loadLedger(selectedParty.party_id);
      const freshParties = await loadParties();
      const updatedParty = (freshParties || []).find(p => p.party_id === selectedParty.party_id);
      if (updatedParty) setSelectedParty(updatedParty);
      setView('ledger');
    } catch {
      showStatus('Operation failed', 'error');
    } finally {
      setIsSavingTx(false);
    }
  };

  return { handleSaveTx };
}
