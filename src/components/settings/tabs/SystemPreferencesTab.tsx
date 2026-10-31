import React, { useMemo, useEffect } from 'react';
import { Download, RotateCcw, AlertCircle, CheckCircle2, Loader2, Bell, Globe, RefreshCw, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { formatTimeAgo, formatBytes } from '../settingsUtils';
import { releaseNotesToCards } from '../releaseNotesUtils';
import type { SettingsForm } from '../settingsFormTypes';
import { getWhatsNewItems } from '../whatsNew';

export interface SystemPreferencesTabProps {
  appVersion: string;
  isDownloading: boolean;
  downloadProgress: SettingsForm['downloadProgress'];
  lastChecked: SettingsForm['lastChecked'];
  updateInfo: SettingsForm['updateInfo'];
  updateReady: boolean;
  updateStatus: SettingsForm['updateStatus'];
  whatsNewLang: SettingsForm['whatsNewLang']; setWhatsNewLang: SettingsForm['setWhatsNewLang'];
  handleRetryDownload: () => void;
  handleInstallUpdate: () => void;
}

/** Updates & What's New: app version, update download / install and feature highlights. */
export const SystemPreferencesTab: React.FC<SystemPreferencesTabProps> = ({
  appVersion,
  isDownloading,
  downloadProgress,
  lastChecked,
  updateInfo,
  updateReady,
  updateStatus,
  whatsNewLang, setWhatsNewLang,
  handleRetryDownload,
  handleInstallUpdate,
}) => {
  const displayItems = useMemo(() => {
    return getWhatsNewItems(null, appVersion);
  }, [appVersion]);

  useEffect(() => {
    if (updateInfo?.releaseNotes) {
      try {
        const cleanVer = updateInfo.version ? updateInfo.version.replace(/^v/, '') : '';
        if (cleanVer) {
          localStorage.setItem(`nafid_release_notes_${cleanVer}`, updateInfo.releaseNotes);
        }
        localStorage.setItem(`nafid_release_notes_${updateInfo.version}`, updateInfo.releaseNotes);
        localStorage.setItem('nafid_cached_release_notes', updateInfo.releaseNotes);
      } catch (_) {
        /* ignore */
      }
    }
  }, [updateInfo]);

  return (
          <div className="space-y-6 animate-in fade-in duration-300">
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
                            <div className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold border shrink-0 uppercase tracking-wider", updateStatus === 'Up to date' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : updateStatus === 'Update available' || updateStatus === 'Update ready' || updateStatus === 'Update ready to install' ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 animate-bounce" : updateStatus === 'Downloading...' || isDownloading ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted/50 border-border text-muted-foreground")}>
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
                    {updateInfo.releaseNotes && (() => {
                      const updateCards = releaseNotesToCards(updateInfo.releaseNotes);
                      if (updateCards.length === 0) return null;
                      return (
                        <div className="px-5 py-4 bg-muted/20 border-b border-border/40 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Bell className="w-4 h-4 text-primary shrink-0" />
                              <p className="text-xs font-black text-foreground uppercase tracking-wider">
                                {whatsNewLang === 'ml' ? `v${updateInfo.version}-ലെ വിശേഷങ്ങൾ` : `What's New in v${updateInfo.version}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Language Switcher */}
                              <div className="flex items-center bg-background/90 p-0.5 rounded-xl border border-border/70 shadow-xs">
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
                              <span className="text-[10px] font-semibold text-muted-foreground/70 bg-background/80 px-2 py-0.5 rounded-full border border-border/50 hidden sm:inline-block">
                                {whatsNewLang === 'ml' ? 'സവിശേഷതകൾ' : 'Release Highlights'}
                              </span>
                            </div>
                          </div>

                          <div className="max-h-72 overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                              {updateCards.map((card) => (
                                <div
                                  key={card.id}
                                  className={clsx(
                                    "p-3 rounded-2xl bg-background/90 border border-border/60 transition-all flex flex-col justify-between space-y-1.5",
                                    card.accent.hover
                                  )}
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={clsx("w-2 h-2 rounded-full shrink-0", card.accent.dot)} />
                                        <p className="font-bold text-foreground text-xs truncate">
                                          {whatsNewLang === 'ml' ? card.title.ml : card.title.en}
                                        </p>
                                      </div>
                                      <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0", card.accent.tag)}>
                                        {whatsNewLang === 'ml' ? card.tag.ml : card.tag.en}
                                      </span>
                                    </div>
                                    {whatsNewLang === 'ml' && card.subtitle && (
                                      <p className={clsx("text-[10px] font-semibold pl-4 -mt-0.5", card.accent.text)}>
                                        {card.subtitle}
                                      </p>
                                    )}
                                    <p className={clsx("text-muted-foreground leading-relaxed pl-4", whatsNewLang === 'ml' ? "text-[11.5px] leading-5 text-foreground/80 font-medium" : "text-[11px]")}>
                                      {whatsNewLang === 'ml' ? card.text.ml : card.text.en}
                                    </p>
                                  </div>
                                  {card.link && (
                                    <div className="pt-1.5 pl-4">
                                      <a
                                        href={card.link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95 cursor-pointer"
                                      >
                                        <span>{card.link.text}</span>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {isDownloading && downloadProgress && (
                      <div className="px-5 py-4 bg-muted/10">
                        <div className="w-full bg-border/50 rounded-full h-2 overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }} /></div>
                        <div className="flex items-center justify-between mt-2"><p className="text-[10px] font-bold text-muted-foreground/80">{Math.round(downloadProgress.percent)}%</p><p className="text-[10px] font-bold text-muted-foreground/80 font-mono">{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</p></div>
                      </div>
                    )}
                    {updateReady && (
                      <div className="p-5 bg-gradient-to-t from-primary/5 to-transparent">
                        <button type="button" onClick={handleInstallUpdate} className="flex items-center justify-center gap-2.5 w-full h-12 rounded-2xl font-bold text-xs bg-primary text-primary-foreground hover:brightness-110 transition-all duration-200 active:scale-95 cursor-pointer shadow-md">
                          <RotateCcw className="w-4 h-4 shrink-0" /> Restart to Update
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

            {/* What's New — shown for current version when no pending update release notes are already shown above */}
            {(!updateInfo || !updateInfo.releaseNotes) && (
              <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
                <div className="space-y-3.5">
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
                    {displayItems.map((item) => (
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
                        {item.link && (
                          <div className="pt-2 pl-4">
                            <a
                              href={item.link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95 cursor-pointer"
                            >
                              <span>{item.link.text}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
  );
};
