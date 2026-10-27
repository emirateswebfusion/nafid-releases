import React from 'react';
import { AlertCircle, CheckCircle2, Tags } from 'lucide-react';
import clsx from 'clsx';
import { CODE_TYPES } from '../../../config/labelCodeTypes';
import { ToggleRow } from '../views/SettingsControls';
import type { SettingsForm } from '../settingsFormTypes';

export interface LabelSettingsTabProps {
  autoPrintBarcode: boolean; setAutoPrintBarcode: (v: boolean) => void;
  labelCodeType: SettingsForm['labelCodeType']; setLabelCodeType: SettingsForm['setLabelCodeType'];
  labelShowShopName: boolean; setLabelShowShopName: (v: boolean) => void;
}

/** Barcode Labels: default code type, shop name on labels and auto-printing labels for new products. */
export const LabelSettingsTab: React.FC<LabelSettingsTabProps> = ({
  autoPrintBarcode, setAutoPrintBarcode,
  labelCodeType, setLabelCodeType,
  labelShowShopName, setLabelShowShopName,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 2: Label Format */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-purple-500/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.1)] shrink-0">
                  <Tags className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-purple-600 uppercase tracking-widest">Product Label Codes</span>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Default Code Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    {CODE_TYPES.map((ct) => (
                      <button
                        type="button"
                        key={ct.id}
                        onClick={() => setLabelCodeType(ct.id)}
                        className={clsx(
                          "relative flex items-center gap-3.5 p-4.5 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                          labelCodeType === ct.id
                            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                            : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                        )}
                      >
                        <div className={clsx(
                          "p-2.5 rounded-xl shrink-0",
                          labelCodeType === ct.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {ct.id === 'barcode' ? (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 4h2v16H2zM6 4h1v16H6zM9 4h2v16H9zM13 4h1v16h-1zM16 4h2v16h-2zM20 4h2v16h-2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              {[7,9,11,13,15].map(x => (
                                <g key={x}>
                                  <rect x={x} y="7" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="11" width="1" height="2" fill="currentColor" />
                                  <rect x={x} y="15" width="1" height="2" fill="currentColor" />
                                </g>
                              ))}
                              <rect x="17" y="7" width="1" height="10" fill="currentColor" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{ct.label}</p>
                          <p className="text-xs text-muted-foreground/75 truncate mt-0.5">{ct.description}</p>
                        </div>
                        {labelCodeType === ct.id && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleRow
                  label="Auto Print Barcode for New Products"
                  description="When a new product is created from the Billing page, automatically print its barcode label."
                  checked={autoPrintBarcode}
                  onToggle={() => setAutoPrintBarcode(!autoPrintBarcode)}
                />

                <div className="flex items-center justify-between gap-4 p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => setLabelShowShopName(!labelShowShopName)}>Show Shop Name on Labels</label>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5">Print the shop name at the top of product barcode and QR labels.</p>
                  </div>
                  <button type="button" onClick={() => setLabelShowShopName(!labelShowShopName)} className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', labelShowShopName ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}>
                    <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', labelShowShopName ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                    The selected code type will be used as the default for generating, previewing, and printing product labels. Existing labels remain unaffected.
                  </p>
                </div>
              </div>
            </div>
          </div>
  );
};
