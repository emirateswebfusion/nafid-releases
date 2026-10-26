import { Modal } from '../../ui/Modal';
import { PowerOff } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface WhatsAppDisconnectDialogProps {
  handleDisconnect: () => Promise<void>;
  wa: WhatsAppSettingsState;
}

/** Confirmation dialog before unlinking the WhatsApp device. */
export function WhatsAppDisconnectDialog({
  handleDisconnect, wa,
}: WhatsAppDisconnectDialogProps) {
  const { loading, phone, setShowConfirmDisconnect, showConfirmDisconnect } = wa;
  return (
    <Modal
      isOpen={showConfirmDisconnect}
      onClose={() => setShowConfirmDisconnect(false)}
      title="Disconnect WhatsApp"
      className="max-w-md rounded-[24px]"
    >
      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <PowerOff className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">Disconnect Linked Device?</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to disconnect WhatsApp number{' '}
              <span className="font-mono font-bold text-foreground">+{phone}</span>? Automated PDF bills, payment alerts, and daily closing overviews will pause until reconnected.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirmDisconnect(false)}
            className="text-xs font-semibold px-4 rounded-xl cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
            disabled={loading}
            className="text-xs font-bold px-4 rounded-xl cursor-pointer"
          >
            <PowerOff className="w-3.5 h-3.5 mr-1.5" />
            {loading ? 'Disconnecting...' : 'Yes, Disconnect'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
