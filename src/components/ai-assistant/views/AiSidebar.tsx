import React from 'react';
import clsx from 'clsx';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Conversation } from '../aiAssistantTypes';
import type { AiAssistantState } from '../hooks/useAiAssistantState';

export interface AiSidebarProps {
  activeConvId: string;
  conversations: Conversation[];
  handleCreateNewChat: () => void;
  handleDeleteConversationClick: (e: React.MouseEvent, conv: Conversation) => void;
  handleRenameConversationClick: (e: React.MouseEvent, conv: Conversation) => void;
  setActiveConvId: React.Dispatch<React.SetStateAction<string>>;
  ai: AiAssistantState;
}

/** Conversation sidebar: new chat, conversation list with rename / delete, clear all. */
export function AiSidebar({
  activeConvId, conversations, handleCreateNewChat, handleDeleteConversationClick, handleRenameConversationClick,
  setActiveConvId, ai,
}: AiSidebarProps) {
  const { languageMode, setLanguageMode, setShowClearAllDialog, setSidebarOpen, sidebarOpen } = ai;
  return (
    <aside
      className={clsx(
        "shrink-0 border-r border-gray-200/80 dark:border-zinc-800 bg-[#f9fafb] dark:bg-zinc-900/60 transition-all duration-300 flex flex-col z-30",
        sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
      )}
    >
      <div className="p-4 flex items-center justify-between border-b border-gray-200/50 dark:border-zinc-800/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#00a870] flex items-center justify-center text-white shadow-2xs">
            <span className="text-base font-black leading-none select-none">✱</span>
          </div>
          <span className="font-bold text-sm tracking-tight text-gray-900 dark:text-gray-100">
            AI Workspace
          </span>
        </div>

        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={handleCreateNewChat}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-750 hover:border-gray-300 transition-all shadow-2xs text-xs font-semibold cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100" />
            <span>New chat</span>
          </div>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-zinc-600">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider select-none">
          <span>Your conversations</span>
          {conversations.length > 0 && conversations.some(c => c.messages && c.messages.length > 0) && (
            <button
              onClick={() => setShowClearAllDialog(true)}
              className="hover:text-rose-500 transition-colors p-0.5 rounded cursor-pointer normal-case font-semibold text-[10px]"
              title="Clear all conversations"
            >
              Clear all
            </button>
          )}
        </div>

        {conversations.map((conv) => {
          const isActive = conv.id === activeConvId;
          return (
            <div
              key={conv.id}
              onClick={() => setActiveConvId(conv.id)}
              className={clsx(
                "group relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left",
                isActive
                  ? "bg-gray-200/70 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              <span className="truncate pr-2">{conv.title || 'Untitled chat'}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleRenameConversationClick(e, conv)}
                  className="p-1 hover:text-gray-900 dark:hover:text-gray-100 text-gray-400 rounded transition-colors cursor-pointer"
                  title="Rename conversation"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => handleDeleteConversationClick(e, conv)}
                  className="p-1 hover:text-rose-600 text-gray-400 rounded transition-colors cursor-pointer"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium">{languageMode === 'ml' ? 'ഈ കമ്പ്യൂട്ടറിലെ വിവരങ്ങൾ' : 'Records on this device'}</span>
        </div>
        <button
          onClick={() => setLanguageMode((prev) => (prev === 'en' ? 'ml' : 'en'))}
          className="text-[11px] font-mono uppercase px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
        >
          {languageMode === 'en' ? 'EN' : 'മലയാളം'}
        </button>
      </div>
    </aside>
  );
}
