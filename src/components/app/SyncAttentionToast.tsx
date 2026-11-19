import { useState } from 'react';
import { FloatToast } from '../ui/FloatToast';
import { syncNeedsAttention } from '../../utils/sync/syncOutcome';

/** Visible on staff billing screens as well as the owner's dashboard. Dismissal does not discard pending data. */
export function SyncAttentionToast({ label, complete }: { label?: string; complete: boolean }) {
  const [dismissed, setDismissed] = useState<string>();
  const visible = complete && label && syncNeedsAttention(label) && dismissed !== label;
  return <FloatToast message={visible ? label : null} type="warning" title="Account sync needs attention"
    position="bottom-left" duration={0} onClose={() => setDismissed(label)} />;
}
