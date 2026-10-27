import React from 'react';
import { Shield, Download, Eye, EyeOff, RotateCcw, AlertCircle, CheckCircle2, Loader2, Type, Minus, Plus, Palette, Bell, Globe, Key, RefreshCw, Zap, Wrench, FileText, Package } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../../ui/Input';
import { useThemeStore } from '../../../store/themeStore';
import { DefaultStockReportViewSelector } from '../settingsConstants';
import { formatTimeAgo, formatBytes } from '../settingsUtils';
import type { SettingsForm } from '../settingsFormTypes';
import { WHATS_NEW } from '../whatsNew';

export interface SystemPreferencesTabProps {
  appVersion: string;
  changingPass: boolean; setPass: SettingsForm['setPass']; pass: SettingsForm['pass'];
  showOldPass: boolean; setShowOldPass: SettingsForm['setShowOldPass'];
  showNewPass: boolean; setShowNewPass: SettingsForm['setShowNewPass'];
  showConfirmPass: boolean; setShowConfirmPass: SettingsForm['setShowConfirmPass'];
  inventoryDefaultView: string; setInventoryDefaultView: (v: string) => void;
  isDownloading: boolean;
  downloadProgress: SettingsForm['downloadProgress'];
  lastChecked: SettingsForm['lastChecked'];
  loading: boolean;
  stockReportDefaultView: string; setStockReportDefaultView: (v: string) => void;
  showPriceTiersInInventory: boolean; setShowPriceTiersInInventory: (v: boolean) => void;
  showProductGstBadge: boolean; setShowProductGstBadge: (v: boolean) => void;
  updateInfo: SettingsForm['updateInfo'];
  updateReady: boolean;
  updateStatus: SettingsForm['updateStatus'];
  whatsNewLang: SettingsForm['whatsNewLang']; setWhatsNewLang: SettingsForm['setWhatsNewLang'];
  setActiveSection: (v: string) => void;
  handleChangePassword: (e: React.FormEvent) => void;
  handleRetryDownload: () => void;
  handleInstallUpdate: () => void;
}

export const SystemPreferencesTab: React.FC<SystemPreferencesTabProps> = ({
  appVersion,
  changingPass, setPass, pass,
  showOldPass, setShowOldPass,
  showNewPass, setShowNewPass,
  showConfirmPass, setShowConfirmPass,
  inventoryDefaultView, setInventoryDefaultView,
  isDownloading,
  downloadProgress,
  lastChecked,
  stockReportDefaultView, setStockReportDefaultView,
  showPriceTiersInInventory, setShowPriceTiersInInventory,
  showProductGstBadge, setShowProductGstBadge,
  updateInfo,
  updateReady,
  updateStatus,
  whatsNewLang, setWhatsNewLang,
  setActiveSection,
  handleChangePassword,
  handleRetryDownload,
  handleInstallUpdate,
}) => {
  const { fontScale, increaseFontScale, decreaseFontScale, setFontScale, primaryColor, fontFamily } = useThemeStore();
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Card 1: Appearance */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Type className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Appearance</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-foreground">Font Size</p>
                    <p className="text-xs text-muted-foreground/75 mt-0.5">Scale the entire UI text size</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={decreaseFontScale} disabled={fontScale <= 70} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-[0_0_6px_rgba(0,0,0,0.06)] dark:shadow-[0_0_6px_rgba(255,255,255,0.04)] hover:shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] hover:border-foreground/20 transition-all duration-200 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Minus className="w-4 h-4" /></button>
                    <div className="w-20 text-center select-none">
                      <span className="text-2xl font-black text-foreground font-mono">{fontScale}%</span>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className={clsx('w-2 h-2 rounded-full shrink-0', fontScale <= 80 ? 'bg-blue-500 animate-pulse' : fontScale <= 100 ? 'bg-emerald-500' : fontScale <= 120 ? 'bg-amber-500' : 'bg-red-500')} />
                        <span className="text-[9px] font-bold text-muted-foreground/80">{fontScale <= 80 ? 'Small' : fontScale <= 100 ? 'Normal' : fontScale <= 120 ? 'Large' : 'X-Large'}</span>
                      </div>
                    </div>
                    <button type="button" onClick={increaseFontScale} disabled={fontScale >= 140} className="w-11 h-11 flex items-center justify-center rounded-2xl bg-background border border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-[0_0_6px_rgba(0,0,0,0.06)] dark:shadow-[0_0_6px_rgba(255,255,255,0.04)] hover:shadow-[0_0_12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] hover:border-foreground/20 transition-all duration-200 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-5 bg-muted/20 dark:bg-muted/10 border border-border/50 rounded-2xl">
                  <div className="flex items-center gap-2 mb-3"><Type className="w-4 h-4 text-primary" /><span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Preview</span></div>
                  <p className="text-xs text-foreground font-semibold leading-relaxed">The quick brown fox jumps over the lazy dog.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">This is how your receipts, invoices, and product labels will appear.</p>
                </div>
                <div className="pt-2">
                  <button type="button" onClick={() => setFontScale(100)} disabled={fontScale === 100} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/80 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-sm">Reset to Default</button>
                </div>

                {/* Theme & Typography Studio Quick Access */}
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-primary-foreground shadow-xs shrink-0"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Palette className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">Theme & Typography Studio</span>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full font-mono">{primaryColor}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Active Font: <span className="font-semibold text-foreground">{fontFamily}</span> • Calibrate system brand accents, fonts, and live previews
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('design')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-95 transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>Open Studio</span>
                  </button>
                </div>

                {/* What's New in App Highlights (User-Facing Information) */}
                <div className="mt-6 pt-5 border-t border-border/70 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                        <Bell className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className={clsx("text-xs font-black text-foreground uppercase tracking-wider", whatsNewLang === 'ml' && "font-malayalam font-bold text-sm tracking-normal")}>
                          {whatsNewLang === 'ml' ? "പുതിയ വിശേഷങ്ങൾ" : "What's New in Nafid"}
                        </span>
                        <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full font-mono">{appVersion}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Language Switcher */}
                      <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border border-border/70 shadow-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsNewLang('ml');
                            try { localStorage.setItem('nafid_whats_new_lang', 'ml'); } catch (_) { /* ignore */ }
                          }}
                          className={clsx(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 cursor-pointer font-malayalam",
                            whatsNewLang === 'ml'
                              ? "bg-primary text-primary-foreground shadow-xs font-black"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Globe className="w-3 h-3" />
                          മലയാളം
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsNewLang('en');
                            try { localStorage.setItem('nafid_whats_new_lang', 'en'); } catch (_) { /* ignore */ }
                          }}
                          className={clsx(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 cursor-pointer",
                            whatsNewLang === 'en'
                              ? "bg-primary text-primary-foreground shadow-xs font-black"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          English
                        </button>
                      </div>

                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest bg-muted/40 px-2 py-0.5 rounded-md hidden sm:inline-block">
                        {whatsNewLang === 'ml' ? 'സവിശേഷതകൾ' : 'Highlights'}
                      </span>
                    </div>
                  </div>

                  <div className={clsx("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs", whatsNewLang === 'ml' && "font-malayalam")}>
                    {WHATS_NEW.map((item) => (
                      <div key={item.title.en} className={clsx("p-3.5 rounded-2xl bg-muted/20 border border-border/60 space-y-1.5 transition-all flex flex-col justify-between", item.accent.hover)}>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={clsx("w-2 h-2 rounded-full shrink-0", item.accent.dot)}></span>
                              <p className="font-bold text-foreground text-xs truncate">{item.title[whatsNewLang]}</p>
                            </div>
                            <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0", item.accent.tag)}>{item.tag[whatsNewLang]}</span>
                          </div>
                          {whatsNewLang === 'ml' && (
                            <p className={clsx("text-[10px] font-semibold pl-4 -mt-0.5", item.accent.text)}>{item.subtitle}</p>
                          )}
                          <p className={clsx("text-muted-foreground leading-relaxed pl-4", whatsNewLang === 'ml' ? "text-[11.5px] leading-5 text-foreground/80 font-medium" : "text-[11px]")}>
                            {item.text[whatsNewLang]}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Security */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Security</span>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-foreground text-sm">Change Password</h3>
                  <p className="text-xs text-muted-foreground/75 mt-1 leading-relaxed">Update your account password regularly to keep your shop secure.</p>
                </div>
                <div className="relative flex items-center">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50 pointer-events-none" />
                  <Input type={showOldPass ? "text" : "password"} placeholder="Current Password" className="pl-11 pr-11 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5" value={pass.old} onChange={(e) => setPass({ ...pass, old: e.target.value })} />
                  <button type="button" onClick={() => setShowOldPass(p => !p)} className="absolute right-3.5 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showOldPass ? "Hide password" : "View password"}>
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative flex items-center">
                    <Input type={showNewPass ? "text" : "password"} placeholder="New Password" value={pass.new} onChange={(e) => setPass({ ...pass, new: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showNewPass ? "Hide password" : "View password"}>
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Input type={showConfirmPass ? "text" : "password"} placeholder="Confirm New Password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} className="pr-10 bg-background/50 focus:bg-background border-border/80 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all rounded-xl py-2.5 w-full" />
                    <button type="button" onClick={() => setShowConfirmPass(p => !p)} className="absolute right-3 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none" title={showConfirmPass ? "Hide password" : "View password"}>
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="button" disabled={changingPass} onClick={handleChangePassword}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold bg-primary/10 hover:bg-primary hover:text-primary-foreground rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20 hover:border-primary shadow-sm">
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Shield className="w-4 h-4 shrink-0" />}
                  Update Password
                </button>
              </div>
            </div>

            {/* Card 3: Updates */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <RefreshCw className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">System Updates</span>
              </div>
              <div className="space-y-5">
                <div className="relative overflow-hidden rounded-[24px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/[0.02] to-transparent shadow-sm">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.06),transparent_70%)]" />
                  <div className="relative p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_4px_20px_rgba(59,130,246,0.15)]"><RefreshCw className="w-5 h-5 animate-pulse" /></div>
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Current Version</p>
                          <p className="text-3xl font-black text-foreground font-mono tracking-tight mt-0.5">{appVersion}</p>
                          {lastChecked && (<p className="text-[10px] text-muted-foreground/60 mt-1">Last checked {formatTimeAgo(lastChecked)}</p>)}
                        </div>
                      </div>
                      {updateStatus && (
                        updateStatus === 'Download failed'
                          ? (
                            <button
                              type="button"
                              onClick={handleRetryDownload}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold border shrink-0 uppercase tracking-wider bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 active:scale-95 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Retry Download
                            </button>
                          ) : (
                            <div className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold border shrink-0 uppercase tracking-wider", updateStatus === 'Up to date' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : updateStatus === 'Update available' || updateStatus === 'Update ready to install' ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 animate-bounce" : updateStatus === 'Downloading...' || isDownloading ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted/50 border-border text-muted-foreground")}>
                              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : updateStatus === 'Up to date' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                              {updateStatus}
                            </div>
                          )
                      )}
                    </div>
                  </div>
                </div>
                {updateStatus === 'Up to date' && !updateInfo && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{appVersion} — You're on the latest version</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">No updates available at this time.</p>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-extrabold rounded-lg border border-emerald-500/20 shrink-0 uppercase tracking-wider">UP TO DATE</span>
                    </div>
                  </div>
                )}
                {updateInfo && (
                  <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5 border-b border-blue-500/10">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"><Download className="w-4.5 h-4.5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">v{updateInfo.version} {updateReady ? 'Ready to Install' : isDownloading ? 'Downloading...' : 'Available'}</p>
                        {updateInfo.releaseDate && (<p className="text-xs text-muted-foreground/70 mt-0.5">Released {new Date(updateInfo.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>)}
                      </div>
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-extrabold rounded-lg border border-blue-500/20 shrink-0 uppercase tracking-wider">{updateReady ? 'READY' : isDownloading ? 'DOWNLOADING' : 'NEW'}</span>
                    </div>
                    {updateInfo.releaseNotes && (
                      <div className="px-5 py-4 bg-muted/20 border-b border-border/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                            <p className="text-xs font-black text-foreground uppercase tracking-wider">
                              What's New in v{updateInfo.version}
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold text-muted-foreground/70 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                            Release Highlights
                          </span>
                        </div>

                        <div className="bg-background/90 rounded-xl p-3.5 border border-border/60 max-h-56 overflow-y-auto space-y-2 text-xs">
                          {typeof updateInfo.releaseNotes === 'string'
                            ? updateInfo.releaseNotes
                                .split('\n')
                                .map((line: string) => line.trim())
                                .filter(Boolean)
                                .map((line: string, i: number) => {
                                  const isFix = /fix|bug|issue|error|resolved|patch/i.test(line);
                                  const cleanLine = line.replace(/^[-*•\d.]+\s*/, '');
                                  return (
                                    <div key={i} className="flex items-start gap-2.5 group">
                                      <div className={clsx(
                                        "mt-0.5 p-1 rounded-md shrink-0 flex items-center justify-center text-[10px]",
                                        isFix
                                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      )}>
                                        {isFix ? <Wrench className="w-3 h-3" /> : <Zap className="w-3 h-3 fill-amber-500/20" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="leading-snug text-foreground/90 font-medium">
                                          {cleanLine}
                                        </p>
                                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 text-muted-foreground">
                                          {isFix ? 'Fix / Improvement' : 'New Feature'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                            : (
                              <p className="text-muted-foreground">{JSON.stringify(updateInfo.releaseNotes)}</p>
                            )}
                        </div>
                      </div>
                    )}
                    {isDownloading && downloadProgress && (
                      <div className="px-5 py-4 bg-muted/10">
                        <div className="w-full bg-border/50 rounded-full h-2 overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }} /></div>
                        <div className="flex items-center justify-between mt-2"><p className="text-[10px] font-bold text-muted-foreground/80">{Math.round(downloadProgress.percent)}%</p><p className="text-[10px] font-bold text-muted-foreground/80 font-mono">{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</p></div>
                      </div>
                    )}
                    {updateReady && (
                      <div className="p-5 bg-gradient-to-t from-primary/5 to-transparent">
                        <button type="button" onClick={handleInstallUpdate} className="flex items-center justify-center gap-2.5 w-full h-12 rounded-2xl font-bold text-xs bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 active:scale-95 cursor-pointer shadow-md">
                          <RotateCcw className="w-4 h-4 shrink-0" /> Restart & Install Update
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {updateStatus === 'Download failed' && (
                  <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.04] to-transparent overflow-hidden shadow-sm">
                    <div className="flex items-center gap-4.5 px-5 py-4.5">
                      <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 shrink-0"><AlertCircle className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">Update Download Failed</p>
                        <p className="text-xs text-muted-foreground/75 mt-0.5">Check your internet connection and try again.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryDownload}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-red-500/10 hover:bg-red-500 hover:text-white rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer border border-red-500/20 hover:border-red-500 shadow-sm shrink-0"
                      >
                        <RefreshCw className="w-4 h-4 shrink-0" /> Try Again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Stock Report Default View */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <FileText className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Stock Report</span>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-foreground">Default View</label>
                <p className="text-xs text-muted-foreground">Choose which tab opens by default when you open the stock report.</p>
                <DefaultStockReportViewSelector value={stockReportDefaultView} onChange={setStockReportDefaultView} />
              </div>
            </div>

            {/* Card 5: Inventory Default View */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Package className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Inventory</span>
              </div>
              <div className="space-y-4">
                <label className="text-sm font-bold text-foreground">Default View</label>
                <p className="text-xs text-muted-foreground">Choose which tab opens by default when you open the inventory manager.</p>
                <DefaultStockReportViewSelector value={inventoryDefaultView} onChange={setInventoryDefaultView} />
              </div>
            </div>

            {/* Card 6: Show GST/Estimate Badge Under Product Name */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Product Display</span>
                  <h4 className="text-sm font-bold text-foreground">Show GST / Estimate Badge Under Product Name</h4>
                  <p className="text-xs text-muted-foreground">
                    Show or hide the small badge (Real, Paper, Estimate / GST) directly under each product name in the Inventory list.
                  </p>
                </div>
                <div
                  onClick={() => setShowProductGstBadge(!showProductGstBadge)}
                  className={clsx(
                    'w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0',
                    showProductGstBadge ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <div
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm',
                      showProductGstBadge ? 'translate-x-6' : 'translate-x-0'
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Card 7: Show Price Tiers Under Product Name */}
            <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Product Display</span>
                  <h4 className="text-sm font-bold text-foreground">Show Price Tiers Under Product Name</h4>
                  <p className="text-xs text-muted-foreground">
                    Show or hide pricing tier badges (Wholesale, Retail, Special Retail, etc.) directly under each product name in the Inventory list.
                  </p>
                </div>
                <div
                  onClick={() => setShowPriceTiersInInventory(!showPriceTiersInInventory)}
                  className={clsx(
                    'w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0',
                    showPriceTiersInInventory ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <div
                    className={clsx(
                      'w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out shadow-sm',
                      showPriceTiersInInventory ? 'translate-x-6' : 'translate-x-0'
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
  );
};
