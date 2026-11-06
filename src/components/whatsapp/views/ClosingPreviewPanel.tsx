import { storeTime } from '../../../utils/time/dateDisplay';
import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { Button } from '../../ui/Button';
import { Loader2, Send } from 'lucide-react';
import type { ShopClosingOverviewConfig } from '../../../utils/time/shopClosingHelper';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface ClosingPreviewPanelProps {
  closingConfig: ShopClosingOverviewConfig;
  handleSaveClosingConfig: () => Promise<void>;
  handleSendTestReport: () => Promise<void>;
  isAdmin: boolean;
  shopName: string;
  wa: WhatsAppSettingsState;
}

/** Live preview of the shop closing WhatsApp message. */
export function ClosingPreviewPanel({
  closingConfig, handleSendTestReport, shopName, wa,
}: ClosingPreviewPanelProps) {
  const { previewLoading, previewText, sendingTest, status } = wa;
  return (
    <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WhatsAppIcon className="w-4 h-4 text-emerald-500 fill-current" />
          <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
            Live Message Preview
          </h4>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground font-mono">
          {previewLoading ? 'Updating...' : 'Real-time Preview'}
        </span>
      </div>

      {/* WhatsApp Chat Bubble Mockup */}
      <div className="rounded-2xl bg-[#0b141a] dark:bg-[#0b141a] border border-border/80 overflow-hidden shadow-md text-white font-sans">
        {/* WhatsApp Top Bar */}
        <div className="bg-[#1f2c34] px-4 py-2.5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
              {shopName.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-white block leading-tight truncate max-w-[150px]">
                {shopName}
              </span>
              <span className="text-[9px] text-emerald-400 block leading-tight">WhatsApp Business</span>
            </div>
          </div>
          <span className="text-[10px] text-white/50 font-mono">
            {storeTime(new Date(), [], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message Bubble Container */}
        <div className="p-4 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px] bg-[#0b141a] max-h-[460px] overflow-y-auto scrollbar-thin">
          <div className="p-3.5 rounded-2xl rounded-tl-sm bg-[#005c4b] text-[#e9edef] text-[11px] leading-relaxed whitespace-pre-wrap font-sans shadow-sm border border-white/5">
            {previewText || 'Configuring overview report...'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5 pt-2">
        <Button
          onClick={handleSendTestReport}
          disabled={sendingTest || !closingConfig.ownerPhone || status !== 'connected'}
          className="w-full text-xs font-bold py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm flex items-center justify-center gap-2"
        >
          {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sendingTest ? 'Dispatching Test...' : 'Send Test Report to WhatsApp'}
        </Button>

<p className="text-xs text-muted-foreground">Apply closing report changes with Save Changes at the top of Settings.</p>
      </div>
    </div>
  );
}
