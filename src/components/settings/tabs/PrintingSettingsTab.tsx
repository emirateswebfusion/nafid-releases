import React from 'react';
import { Printer, Receipt, FileText, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

export interface PrintingSettingsTabProps {
  printFormat: any;
  setPrintFormat: (v: any) => void;
  a5Orientation: any;
  setA5Orientation: (v: any) => void;
  timeFormat: any;
  setTimeFormat: (v: any) => void;
  a4Style: any;
  setA4Style: (v: any) => void;
  thermalStyle: any;
  setThermalStyle: (v: any) => void;
  setPreviewStyle: (v: any) => void;
  setPreviewFormat: (v: any) => void;
  printWidth: number;
  setActiveSection: (v: any) => void;
}

export const PrintingSettingsTab: React.FC<PrintingSettingsTabProps> = ({
  printFormat,
  setPrintFormat,
  a5Orientation,
  setA5Orientation,
  timeFormat,
  setTimeFormat,
  a4Style,
  setA4Style,
  thermalStyle,
  setThermalStyle,
  setPreviewStyle,
  setPreviewFormat,
  printWidth,
  setActiveSection,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: Normal Print Paper Format (Bill of Supply & Estimate) */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Printer className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-black text-primary uppercase tracking-widest block">Normal Print Paper Format</span>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">Format used for non-GST bills (Bill of Supply &amp; Estimate)</p>
                </div>
              </div>

              <div className="space-y-6">

                {/* Normal Print Format Toggle: Thermal vs A5 (Half A4) vs A4 */}
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Select Format for BOS / Estimate</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setPrintFormat('thermal')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'thermal'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'thermal' ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">Thermal Receipt</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">58mm / 80mm roll paper</p>
                      </div>
                      {printFormat === 'thermal' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintFormat('half-a4')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'half-a4'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'half-a4' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A5 Paper (Half-A4)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Estimate &amp; BOS cut-sheet</p>
                      </div>
                      {printFormat === 'half-a4' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintFormat('a4')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left h-full",
                        printFormat === 'a4'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", printFormat === 'a4' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A4 Paper</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Full-page A4 document</p>
                      </div>
                      {printFormat === 'a4' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Time Format Toggle */}
                <div className="pt-4 border-t border-border/40">
                  <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-3 block">Time Format</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setTimeFormat('12h')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        timeFormat === '12h'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl", timeFormat === '12h' ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground")}>
                        <Printer className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">12-hour Format</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">e.g., 09:12 PM</p>
                      </div>
                      {timeFormat === '12h' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormat('24h')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        timeFormat === '24h'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl", timeFormat === '24h' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        <Printer className="w-5 h-5 shrink-0" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">24-hour Format</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">e.g., 21:12</p>
                      </div>
                      {timeFormat === '24h' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* 1. A4 & A5 Invoice Style Selector */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <div>
                    <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block">A4 &amp; A5 Invoice Style</span>
                    <p className="text-[11px] text-muted-foreground/75 mt-0.5">Applied automatically when printing A4, A5, GST, or B2B tax invoices</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'standard', name: 'Standard', color: 'from-blue-500/10 to-blue-500/5' },
                      { id: 'boxed', name: 'GST Boxed', color: 'from-emerald-500/10 to-emerald-500/5' },
                      { id: 'modern', name: 'Modern', color: 'from-amber-500/10 to-amber-500/5' },
                      { id: 'classic', name: 'Classic', color: 'from-rose-500/10 to-rose-500/5' }
                    ].map((style) => {
                      const isActive = a4Style === style.id;
                      return (
                        <div key={style.id} className={clsx("relative rounded-2xl border-2 transition-all duration-300 overflow-hidden hover:shadow-md hover:border-primary/45", isActive ? "border-primary shadow-md ring-2 ring-primary/5 bg-card" : "border-border/80")}>
                          {isActive && <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/20"><CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" /></div>}
                          <button type="button" onClick={() => { setA4Style(style.id as any); }} className="w-full cursor-pointer text-left">
                            <div className={clsx("p-3 border-b border-border bg-gradient-to-r", style.color)}>
                              <span className="text-xs font-extrabold text-foreground">{style.name}</span>
                            </div>
                          </button>
                          <div className="bg-muted/20 dark:bg-muted/5 flex justify-center py-4">
                            <div className="relative group flex justify-center">
                              <button type="button" onClick={() => { setPreviewStyle(style.id); setPreviewFormat('a4'); }} className="bg-card shadow-inner font-mono overflow-hidden border border-border w-36 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                                <div className="text-[8px] text-center p-2.5 text-muted-foreground/60 font-semibold select-none">{style.name} Preview</div>
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('a4'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer" title="Full Preview"><FileText className="w-3.5 h-3.5 text-primary-foreground" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Thermal Receipt Typography & Style */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                    <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5">
                      Thermal Roll Width: <strong className="text-foreground font-bold">{printWidth}mm</strong>
                    </span>
                    <button type="button" onClick={() => setActiveSection('hardware')} className="text-primary hover:underline text-[11px] font-bold cursor-pointer">
                      Configure in Devices &amp; Hardware &rarr;
                    </button>
                  </div>

                  <div>
                    <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block mb-1">Thermal Receipt Style</span>
                    <p className="text-[11px] text-muted-foreground/75 mb-3">Layout format used for thermal roll printer receipts</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'standard', name: 'Standard', color: 'from-blue-500/10 to-blue-500/5' },
                        { id: 'compact', name: 'Compact', color: 'from-violet-500/10 to-violet-500/5' },
                        { id: 'modern', name: 'Modern', color: 'from-amber-500/10 to-amber-500/5' },
                        { id: 'classic', name: 'Classic', color: 'from-rose-500/10 to-rose-500/5' },
                        { id: 'clean', name: 'Clean', color: 'from-emerald-500/10 to-emerald-500/5' },
                        { id: 'dot', name: 'Dot', color: 'from-cyan-500/10 to-cyan-500/5' },
                        { id: 'slim', name: 'Slim', color: 'from-gray-500/10 to-gray-500/5' },
                        { id: 'luxe', name: 'Luxe', color: 'from-yellow-500/10 to-yellow-500/5' },
                        { id: 'boxed', name: 'Boxed', color: 'from-teal-500/10 to-teal-500/5' }
                      ].map((style) => {
                        const isActive = thermalStyle === style.id;
                        return (
                          <div key={style.id} className={clsx("relative rounded-2xl border-2 transition-all duration-300 overflow-hidden hover:shadow-md hover:border-primary/45", isActive ? "border-primary shadow-md ring-2 ring-primary/5 bg-card" : "border-border/80")}>
                            {isActive && <div className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm shadow-primary/20"><CheckCircle2 className="w-3 h-3 text-primary-foreground" /></div>}
                            <button type="button" onClick={() => { setThermalStyle(style.id as any); }} className="w-full cursor-pointer text-left">
                              <div className={clsx("p-3 border-b border-border bg-gradient-to-r", style.color)}>
                                <span className="text-xs font-extrabold text-foreground">{style.name}</span>
                              </div>
                            </button>
                            <div className="bg-muted/20 dark:bg-muted/5 flex justify-center py-4">
                              <div className="relative group flex justify-center">
                                <button type="button" onClick={() => { setPreviewStyle(style.id); setPreviewFormat('thermal'); }} className="bg-card shadow-inner font-mono overflow-hidden border border-border w-36 rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                                  <div className="text-[8px] text-center p-2.5 text-muted-foreground/60 font-semibold select-none">{style.name} Preview</div>
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setPreviewStyle(style.id); setPreviewFormat('thermal'); }} className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-primary text-primary-foreground rounded-lg shadow-lg hover:bg-primary/95 cursor-pointer" title="Full Preview"><FileText className="w-3.5 h-3.5 text-primary-foreground" /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. A5 Page Orientation */}
                <div className="space-y-4 pt-6 border-t border-border/40 animate-in fade-in duration-300">
                  <span className="text-xs font-extrabold text-foreground uppercase tracking-wider block mb-1">A5 Page Orientation</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setA5Orientation('horizontal')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        a5Orientation === 'horizontal'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", a5Orientation === 'horizontal' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5 rotate-90" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">Half-A4 Cut Sheet (210mm Wide)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Cut Half-A4 sheet (210mm wide feed - Recommended)</p>
                      </div>
                      {a5Orientation === 'horizontal' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setA5Orientation('vertical')}
                      className={clsx(
                        "relative flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-left",
                        a5Orientation === 'vertical'
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/10"
                          : "border-border/80 hover:border-primary/35 hover:bg-muted/20"
                      )}
                    >
                      <div className={clsx("p-2.5 rounded-xl shrink-0", a5Orientation === 'vertical' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">A5 Vertical (148.5mm Wide)</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">Standard A5 portrait paper (148mm feed)</p>
                      </div>
                      {a5Orientation === 'vertical' && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
  );
};
