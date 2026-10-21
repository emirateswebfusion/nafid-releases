import React, { useState, useEffect } from 'react';
import { FileText, X } from 'lucide-react';
import { useTabStore } from '../../../store/tabStore';

export const BillDescriptionCard = React.memo(({
  activeTabId,
  inputRef,
  onKeyDown,
}: {
  activeTabId: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) => {
  const tabDescription = useTabStore(s => s.tabs.find(t => t.id === activeTabId)?.description || '');
  const updateActiveTab = useTabStore(s => s.updateActiveTab);
  const [localText, setLocalText] = useState(tabDescription);

  useEffect(() => {
    setLocalText(tabDescription);
  }, [activeTabId, tabDescription]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalText(val);
    updateActiveTab({ description: val });
  };

  return (
    <div className="mt-2.5">
      <input
        ref={inputRef}
        type="text"
        placeholder="Bill Description / Remarks"
        value={localText}
        onChange={handleChange}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            onKeyDown?.(e);
          }
        }}
        onKeyUp={e => e.stopPropagation()}
        className="w-full px-3 py-2 bg-background border border-border/70 rounded-xl text-xs font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-xs"
      />
    </div>
  );
});

