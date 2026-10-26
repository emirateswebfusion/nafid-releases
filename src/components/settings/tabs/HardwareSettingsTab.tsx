import React from 'react';
import { Printer, Globe, Usb, FileText, Scale, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import type { SettingsForm } from '../settingsFormTypes';

export interface HardwareSettingsTabProps {
  activeHardwareTab: string;
  setActiveHardwareTab: SettingsForm['setActiveHardwareTab'];
  receiptPrinter: SettingsForm['receiptPrinter'];
  setReceiptPrinter: SettingsForm['setReceiptPrinter'];
  barcodePrinter: SettingsForm['barcodePrinter'];
  setBarcodePrinter: SettingsForm['setBarcodePrinter'];
  a4Printer: SettingsForm['a4Printer'];
  setA4Printer: SettingsForm['setA4Printer'];
  scale: SettingsForm['scale'];
  setScale: SettingsForm['setScale'];
  osPrinters: SettingsForm['osPrinters'];
  printersLoading: boolean;
  fetchPrinters: (force?: boolean) => void;
  printWidth: number;
  setPrintWidth: (v: number) => void;
}

export const HardwareSettingsTab: React.FC<HardwareSettingsTabProps> = ({
  activeHardwareTab,
  setActiveHardwareTab,
  receiptPrinter,
  setReceiptPrinter,
  barcodePrinter,
  setBarcodePrinter,
  a4Printer,
  setA4Printer,
  scale,
  setScale,
  osPrinters,
  printersLoading,
  fetchPrinters,
  printWidth,
  setPrintWidth,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Sub-tabs */}
            <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto">
              {[
                { id: 'receipt', label: 'Receipt Printer', icon: Printer },
                { id: 'barcode', label: 'Barcode Printer', icon: Printer },
                { id: 'a4', label: 'A4 & A5 Printer', icon: FileText },
                { id: 'scale', label: 'Weighing Scale', icon: Scale },
              ].map((tab) => {
                const Icon = tab.icon;
                const isTabActive = activeHardwareTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveHardwareTab(tab.id as any)}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                      isTabActive
                        ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold scale-100"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-current" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Refresh Printers Button */}
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={() => fetchPrinters(true)}
                disabled={printersLoading}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30 hover:border-primary/30 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh printer list from system"
              >
                <RefreshCw className={clsx("w-4 h-4 shrink-0 transition-transform duration-300", printersLoading && "animate-spin")} />
                <span>{printersLoading ? 'Refreshing...' : 'Refresh Printers'}</span>
              </button>
            </div>

            {/* Render selected hardware settings card */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm">
              {activeHardwareTab === 'receipt' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Printer className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Receipt Printer Settings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Connection Type</label>
                      <div className="flex gap-3">
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'network' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'network' })}>
                          <Globe className="w-4 h-4 shrink-0" /> Network (TCP/IP)
                        </button>
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", receiptPrinter.type === 'usb' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setReceiptPrinter({ ...receiptPrinter, type: 'usb' })}>
                          <Usb className="w-4 h-4 shrink-0" /> USB (OS Print Queue)
                        </button>
                      </div>
                    </div>
                    {receiptPrinter.type === 'network' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Printer IP Address</label>
                          <Input type="text" value={receiptPrinter.ip} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, ip: e.target.value })} placeholder="192.168.1.100" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Port</label>
                          <Input type="text" inputMode="numeric" value={receiptPrinter.port ?? 9100} onChange={(e) => setReceiptPrinter({ ...receiptPrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Select USB Printer</label>
                        <Select value={receiptPrinter.deviceName} placeholder={osPrinters.length === 0 ? 'No printers found — click Refresh Printers' : '-- Select a printer --'} onChange={v => setReceiptPrinter({ ...receiptPrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} disabled={osPrinters.length === 0} />
                      </div>
                    )}
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Paper Width (mm)</label>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <Select
                            value={[58, 80, 76, 112].includes(Number(printWidth)) ? String(printWidth) : 'custom'}
                            onChange={(v) => {
                              if (v !== 'custom') {
                                const num = Number(v);
                                setPrintWidth(num);
                                setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: (num / 10).toString() });
                              }
                            }}
                            options={[
                              { value: '58', label: '58mm (2" Standard Small Thermal)' },
                              { value: '80', label: '80mm (3" Standard Wide Thermal)' },
                              { value: '76', label: '76mm (3" Impact / Dot Matrix Roll)' },
                              { value: '112', label: '112mm (4" Wide Desktop Thermal)' },
                              { value: 'custom', label: 'Custom Width (mm)...' }
                            ]}
                          />
                        </div>
                        {![58, 80, 76, 112].includes(Number(printWidth)) && (
                          <div className="w-36">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={printWidth ?? 58}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const num = val === '' ? 58 : Number(val);
                                setPrintWidth(num);
                                setReceiptPrinter({ ...receiptPrinter, receiptWidthCm: (num / 10).toString() });
                              }}
                              placeholder="e.g. 58"
                              className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono"
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Standard thermal roll sizes are 58mm (5.8cm) and 80mm (8.0cm).</p>
                    </div>

                    <div className="col-span-2 space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider block">Left Margin Offset (mm) [Optional]</label>
                        <span className="text-[10px] text-muted-foreground/70 font-mono">Default: 0mm</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <Input
                          type="number"
                          value={receiptPrinter.leftMarginOffsetMm ?? 0}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            setReceiptPrinter({ ...receiptPrinter, leftMarginOffsetMm: isNaN(val) ? 0 : val });
                          }}
                          placeholder="0"
                          className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono w-32"
                        />
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                          For POS80 / thermal printers shifted rightwards, enter a negative offset (e.g. <span className="font-mono font-bold text-foreground">-10</span> or <span className="font-mono font-bold text-foreground">-15</span>) to pull the print back to the left without affecting other printers.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeHardwareTab === 'barcode' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Printer className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Barcode Printer Settings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Connection Type</label>
                      <div className="flex gap-3">
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'network' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'network' })}>
                          <Globe className="w-4 h-4 shrink-0" /> Network (TCP/IP)
                        </button>
                        <button type="button" className={clsx("flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-95 flex-1 cursor-pointer", barcodePrinter.type === 'usb' ? "border-primary bg-primary/10 text-primary shadow-sm font-extrabold" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30")} onClick={() => setBarcodePrinter({ ...barcodePrinter, type: 'usb' })}>
                          <Usb className="w-4 h-4 shrink-0" /> USB (OS Print Queue)
                        </button>
                      </div>
                    </div>
                    {barcodePrinter.type === 'network' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Printer IP Address</label>
                          <Input type="text" value={barcodePrinter.ip} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, ip: e.target.value })} placeholder="192.168.1.100" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Port</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.port ?? 9100} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, port: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Select USB Printer</label>
                        <Select value={barcodePrinter.deviceName} placeholder={osPrinters.length === 0 ? 'No printers found — click Refresh Printers' : '-- Select a printer --'} onChange={v => setBarcodePrinter({ ...barcodePrinter, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} disabled={osPrinters.length === 0} />
                      </div>
                    )}
                    {barcodePrinter.type === 'usb' && (
                      <div className="col-span-2 grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Width (mm)</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelWidthMm ?? 50} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelWidthMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Height (mm)</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelHeightMm ?? 25} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelHeightMm: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Label Columns</label>
                          <Input type="text" inputMode="numeric" value={barcodePrinter.labelColumns ?? 1} onChange={(e) => setBarcodePrinter({ ...barcodePrinter, labelColumns: e.target.value === '' ? '' : e.target.value.replace(/\D/g, '') })} className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

{activeHardwareTab === 'a4' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <FileText className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">A4 & A5 Printer Settings</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block">Select A4 / A5 Printer Device</label>
                    <Select value={a4Printer.deviceName} placeholder={osPrinters.length === 0 ? 'No printers found — click Refresh Printers' : '-- Use default system printer --'} onChange={v => setA4Printer({ ...a4Printer, deviceName: v })} options={osPrinters.map(p => ({value:p.name,label:p.name}))} disabled={osPrinters.length === 0} />
                    <p className="text-[10px] text-muted-foreground/75 mt-2">Choose the printer to use for A5 estimates & full A4 invoices. Leave as default to use system printer dialog.</p>
                  </div>
                </div>
              )}

              {activeHardwareTab === 'scale' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    <Scale className="w-4.5 h-4.5 text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-foreground">Weighing Scale Connection</span>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Serial Port (COM/tty)</label>
                      <Input type="text" value={scale.path} onChange={(e) => setScale({ ...scale, path: e.target.value })} placeholder="COM3" className="bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 font-mono" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block">Baud Rate</label>
                      <Select value={String(scale.baudRate)} onChange={v => setScale({ ...scale, baudRate: parseInt(v) })} options={['2400','4800','9600','19200','38400','115200'].map(b => ({value:b,label:b}))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
  );
};
