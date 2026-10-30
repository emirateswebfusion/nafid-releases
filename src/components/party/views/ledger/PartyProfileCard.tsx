import { getCurrencyPrefix } from '../../../../utils/localization/storeProfile';
import { getInitials, formatDate } from '../../partyUtils';
import { Pencil, Link, Phone, FileText, MapPin } from 'lucide-react';
import { hasBridge } from '../../../../data/client';
import { partiesApi } from '../../../../data/parties';
import clsx from 'clsx';
import { WhatsAppIcon } from '../../../ui/WhatsAppIcon';
import type { PartyLedgerViewProps } from '../PartyLedgerView';

export interface PartyProfileCardProps {
  isOwner: boolean;
  ledger: PartyLedgerViewProps['ledger'];
  selectedParty: PartyLedgerViewProps['selectedParty'];
  setConnectCodeInput: (v: string) => void;
  setParties: PartyLedgerViewProps['setParties'];
  setSearchResult: PartyLedgerViewProps['setSearchResult'];
  setSelectedParty: PartyLedgerViewProps['setSelectedParty'];
  setShowConnectModal: (v: boolean) => void;
  showStatus: PartyLedgerViewProps['showStatus'];
  startEditingParty: PartyLedgerViewProps['startEditingParty'];
}

/** Party profile and identity: name, contact, GST, category and quick actions. */
export function PartyProfileCard({
  isOwner, ledger, selectedParty, setConnectCodeInput, setParties, setSearchResult, setSelectedParty,
  setShowConnectModal, showStatus, startEditingParty,
}: PartyProfileCardProps) {
  return (
    <div className="flex items-start gap-4 min-w-0">
      {/* Avatar with subtle styling */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-base shadow-xs shrink-0 select-none bg-gradient-to-br from-primary/90 to-primary/60 border border-primary/20"
      >
        {getInitials(selectedParty.name)}
      </div>

      <div className="min-w-0 space-y-1.5">
        {/* Row 1: Name, Type Tag, Connection Status */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-base font-bold text-foreground tracking-tight truncate">{selectedParty.name}</h2>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground border border-border">
            {selectedParty.custom_category || (selectedParty.party_type === 'CUSTOMER' ? 'Customer' : 'Supplier')}
          </span>
          {isOwner && (
            <button
              type="button"
              onClick={() => startEditingParty(selectedParty, 'ledger')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 hover:bg-primary/15 px-2.5 py-0.5 rounded-md transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Edit Party Details"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit Party</span>
            </button>
          )}
          {selectedParty.connection_status === 'CONNECTED' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected Ledger
            </span>
          ) : selectedParty.connection_status === 'PENDING' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Connection Pending
            </span>
          ) : (
            <button
              onClick={() => {
                setConnectCodeInput(selectedParty.connect_code || '');
                setSearchResult(null);
                setShowConnectModal(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 hover:bg-primary/15 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
            >
              <Link className="w-3 h-3" /> Connect Ledger
            </button>
          )}
        </div>

        {/* Row 2: Phone, GSTIN, Address */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {selectedParty.phone && (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
              <Phone className="w-3 h-3 text-muted-foreground" />
              <span>{selectedParty.phone}</span>
            </span>
          )}
          {selectedParty.gstin && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border">
              <FileText className="w-3 h-3" />
              <span>{selectedParty.gstin}</span>
            </span>
          )}
          {selectedParty.address && (
            <span className="hidden md:inline-flex items-center gap-1 text-muted-foreground truncate max-w-[240px]" title={selectedParty.address}>
              <MapPin className="w-3 h-3 shrink-0" />
              <span>{selectedParty.address}</span>
            </span>
          )}
        </div>

        {/* Row 3: WA Alert Toggle & Meta stats */}
        <div className="flex items-center gap-3 text-xs flex-wrap pt-0.5">
          {selectedParty.phone && (
            <button
              type="button"
              onClick={async () => {
                const currentVal = selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false;
                const nextVal = !currentVal;
                try {
                  if (hasBridge('dbUpdateParty')) {
                    await partiesApi.updateParty({
                      party_id: selectedParty.party_id,
                      name: selectedParty.name,
                      phone: selectedParty.phone || null,
                      address: selectedParty.address || null,
                      gstin: selectedParty.gstin || null,
                      party_type: selectedParty.party_type,
                      custom_category: selectedParty.custom_category || null,
                      notes: selectedParty.notes || null,
                      pricing_tier_id: selectedParty.pricing_tier_id || null,
                      credit_limit: selectedParty.credit_limit || 0,
                      credit_period_enabled: selectedParty.credit_period_enabled,
                      credit_period_days: selectedParty.credit_period_days || 30,
                      credit_period_basis: selectedParty.credit_period_basis,
                      restrict_on_credit_expiry: selectedParty.restrict_on_credit_expiry,
                      whatsapp_alerts_enabled: nextVal,
                    });
                    setSelectedParty(prev => prev ? { ...prev, whatsapp_alerts_enabled: nextVal } : prev);
                    setParties(prev => prev.map(p => p.party_id === selectedParty.party_id ? { ...p, whatsapp_alerts_enabled: nextVal } : p));
                    showStatus(`WhatsApp alerts ${nextVal ? 'enabled' : 'disabled'} for ${selectedParty.name}`, 'success');
                  }
                } catch {
                  showStatus('Failed to update party WhatsApp alert setting', 'error');
                }
              }}
              className={clsx(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer select-none",
                selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false
                  ? "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground border-border hover:text-foreground"
              )}
              title="Click to toggle WhatsApp alerts for this party"
            >
              <WhatsAppIcon className="w-3 h-3 fill-current" />
              <span>WA Alerts: {selectedParty.whatsapp_alerts_enabled !== 0 && selectedParty.whatsapp_alerts_enabled !== false ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <span className="text-[11px] text-muted-foreground">
            {ledger.length} {ledger.length === 1 ? 'entry' : 'entries'}
            {selectedParty.last_transaction_date ? ` · Last: ${formatDate(selectedParty.last_transaction_date)}` : ''}
          </span>

          {selectedParty.credit_limit != null && selectedParty.credit_limit > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Limit: <span className="font-mono font-medium">{getCurrencyPrefix()}{selectedParty.credit_limit.toLocaleString()}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
