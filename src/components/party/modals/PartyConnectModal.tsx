import React from 'react';
import { Link, Check, Copy, Search, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';

const fieldCls = "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all duration-200 shadow-sm";

export interface PartyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  myConnectCode: string;
  copiedMyCode: boolean;
  setCopiedMyCode: (v: boolean) => void;
  connectCodeInput: string;
  setConnectCodeInput: (v: string) => void;
  searching: boolean;
  searchResult: any;
  setSearchResult: (v: any) => void;
  partyNameForConnect: string;
  setPartyNameForConnect: (v: string) => void;
  isSavingParty: boolean;
  onSearch: () => void;
  onSendRequest: () => void;
}

export const PartyConnectModal: React.FC<PartyConnectModalProps> = ({
  isOpen,
  onClose,
  myConnectCode,
  copiedMyCode,
  setCopiedMyCode,
  connectCodeInput,
  setConnectCodeInput,
  searching,
  searchResult,
  setSearchResult,
  partyNameForConnect,
  setPartyNameForConnect,
  isSavingParty,
  onSearch,
  onSendRequest,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setSearchResult(null); }}
      title={
        <div className="flex items-center gap-2.5 font-bold text-foreground">
          <Link className="w-5 h-5 text-indigo-500" />
          <span>Connect Party Ledger</span>
        </div>
      }
    >
      <div className="space-y-4 min-w-[420px] text-foreground">
        {/* Your Store Connect Code Banner */}
        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase font-black text-indigo-600 dark:text-indigo-400 tracking-wider">Your Store Connect Code (To Share)</p>
            <p className="text-base font-mono font-black text-indigo-700 dark:text-indigo-300 mt-0.5">{myConnectCode || 'Loading...'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (myConnectCode) {
                navigator.clipboard.writeText(myConnectCode);
                setCopiedMyCode(true);
                setTimeout(() => setCopiedMyCode(false), 2000);
              }
            }}
            className="px-3 py-1.5 text-xs font-bold bg-background hover:bg-muted border border-border text-foreground rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            {copiedMyCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedMyCode ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Enter the counterparty's 8-character <strong>Nafid Connect Code</strong> (found in their App Settings).
        </p>

        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Nafid Connect Code *</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. NF-8924K"
              value={connectCodeInput}
              onChange={e => setConnectCodeInput(e.target.value.toUpperCase())}
              className={clsx(fieldCls, 'uppercase font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400')}
            />
            <button
              type="button"
              disabled={searching}
              onClick={onSearch}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Search
            </button>
          </div>
        </div>

        {searchResult && (
          <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">Business Found</p>
              <p className="text-base font-black text-foreground mt-0.5">{searchResult.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Domain: {searchResult.domain_type} · Code: {searchResult.connect_code}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Party Display Name in Your Ledger</label>
              <input
                type="text"
                placeholder="e.g. Royal Hardwares"
                value={partyNameForConnect}
                onChange={e => setPartyNameForConnect(e.target.value)}
                className={fieldCls}
              />
            </div>

            <button
              type="button"
              disabled={isSavingParty}
              onClick={onSendRequest}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              {isSavingParty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              Send Connection Request
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
