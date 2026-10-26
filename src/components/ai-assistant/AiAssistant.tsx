import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Trash2, PanelLeftClose, PanelLeft, X, Pencil } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { CustomDialog } from '../ui/CustomDialog';
import { FloatToast } from '../ui/FloatToast';
import { type Conversation, getAiConversationsStorageKey, getAiActiveConvIdStorageKey, BENTO_CARDS_EN, BENTO_CARDS_ML } from './aiAssistantTypes';
import { useAiAssistantState } from './hooks/useAiAssistantState';
import { useAiConversations } from './hooks/useAiConversations';
import { useAiChatActions } from './hooks/useAiChatActions';
import { useAiMessageFormatting } from './hooks/useAiMessageFormatting';
import { AiComposer } from './views/AiComposer';
import { AiMessageList } from './views/AiMessageList';
import { AiSidebar } from './views/AiSidebar';

export function AiAssistant({ onClose }: { onClose?: () => void }) {
  const { tenantId, userId } = useAuthStore();

  const convStorageKey = useMemo(() => getAiConversationsStorageKey(tenantId, userId), [tenantId, userId]);
  const activeIdStorageKey = useMemo(() => getAiActiveConvIdStorageKey(tenantId, userId), [tenantId, userId]);

  const loadConversationsFromStorage = useCallback((): Conversation[] => {
    try {
      const saved = localStorage.getItem(convStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const withMessages = parsed.filter((c: Conversation) => c.messages && c.messages.length > 0);
          const emptyChats = parsed.filter((c: Conversation) => !c.messages || c.messages.length === 0);
          if (emptyChats.length > 0) {
            return [emptyChats[0], ...withMessages];
          }
          if (withMessages.length > 0) {
            return withMessages;
          }
        }
      }
    } catch { /* ignore */ }
    const initialId = 'conv-' + Date.now();
    return [
      {
        id: initialId,
        title: 'New chat',
        createdAt: Date.now(),
        messages: []
      }
    ];
  }, [convStorageKey]);

  const [conversations, setConversations] = useState<Conversation[]>(loadConversationsFromStorage);

  const [activeConvId, setActiveConvId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(activeIdStorageKey);
      if (savedId) return savedId;
    } catch { /* ignore */ }
    return conversations[0]?.id || 'conv-1';
  });

  // Whenever switching account (user or tenant), reload only this account's conversations
  useEffect(() => {
    // Purge legacy un-scoped chat storage to eliminate cross-account leakage
    try {
      localStorage.removeItem('nafid_pos_ai_conversations_v3');
      localStorage.removeItem('nafid_pos_ai_active_conv_id_v3');
      localStorage.removeItem('nafid_pos_ai_conversations');
    } catch { /* ignore */ }

    const loaded = loadConversationsFromStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- convStorageKey switches account-scoped storage after commit, preserving the current account transition.
    setConversations(loaded);
    try {
      const savedActiveId = localStorage.getItem(activeIdStorageKey);
      if (savedActiveId && loaded.some((c) => c.id === savedActiveId)) {
        setActiveConvId(savedActiveId);
      } else {
        setActiveConvId(loaded[0]?.id || 'conv-1');
      }
    } catch {
      setActiveConvId(loaded[0]?.id || 'conv-1');
    }
  }, [convStorageKey, activeIdStorageKey, loadConversationsFromStorage]);

  const ai = useAiAssistantState();
  const {
    sidebarOpen, setSidebarOpen, input, isLoading, languageMode, convToDelete,
    setConvToDelete, convToRename, setConvToRename, renameTitleInput, setRenameTitleInput, showClearAllDialog,
    setShowClearAllDialog, toastMessage, setToastMessage,
  } = ai;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist conversations strictly scoped to active tenant & user account
  useEffect(() => {
    try {
      localStorage.setItem(convStorageKey, JSON.stringify(conversations));
      localStorage.setItem(activeIdStorageKey, activeConvId);
    } catch { /* ignore */ }
  }, [conversations, activeConvId, convStorageKey, activeIdStorageKey]);

  const activeConversation = useMemo(() => {
    const found = conversations.find((c) => c.id === activeConvId);
    return found || conversations[0];
  }, [conversations, activeConvId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- messages remains a fresh empty fallback without an active conversation to preserve the original scroll effect timing.
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // eslint-disable-next-line react-hooks/immutability -- the custom hook declares this callback later in render, before the mount-time listener can run.
        handleCreateNewChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleCreateNewChat excluded: the shortcut intentionally captures its original mount-time callback.
  }, []);

  const { handleCreateNewChat, handleDeleteConversationClick, executeDeleteConversation, handleRenameConversationClick, executeRenameConversation, executeClearAllConversations } = useAiConversations({
    ai, activeConversation, activeConvId, conversations, setActiveConvId, setConversations, textareaRef,
  });

  const { handleSpeak, handleCopy, handleCopyTableCSV, handleSend, handleKeyDown } = useAiChatActions({
    ai, activeConvId, messages, setConversations, tenantId,
  });

  const { renderFormattedContent } = useAiMessageFormatting({
    handleCopyTableCSV,
  });

  const bentoCards = languageMode === 'ml' ? BENTO_CARDS_ML : BENTO_CARDS_EN;
  return (
    <div className="h-full w-full min-w-0 flex bg-[#fbfbfb] dark:bg-zinc-950 text-gray-900 dark:text-gray-100 overflow-hidden font-sans select-text">
      {/* ── Left Sidebar ────────────────────────────────────────────────────── */}
      <AiSidebar
        activeConvId={activeConvId} conversations={conversations} handleCreateNewChat={handleCreateNewChat}
        handleDeleteConversationClick={handleDeleteConversationClick}
        handleRenameConversationClick={handleRenameConversationClick} setActiveConvId={setActiveConvId} ai={ai}
      />

      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative bg-white dark:bg-zinc-950 w-full">
        <header className="shrink-0 h-12 flex items-center justify-between px-4 sm:px-6 border-b border-gray-100 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xs z-10 w-full">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
              {activeConversation?.title || 'AI Workspace'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* ── Content View (Dynamic ChatGPT-style Responsive View) ─────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 lg:px-12 py-6 flex flex-col min-w-0 w-full">
          <AiMessageList
            bentoCards={bentoCards} handleCopy={handleCopy} handleSend={handleSend} handleSpeak={handleSpeak}
            messages={messages} messagesEndRef={messagesEndRef} renderFormattedContent={renderFormattedContent} ai={ai}
          />
        </div>

        {/* ── Bottom Floating Input Deck ─────────────────────────────────────── */}
        <AiComposer
          handleKeyDown={handleKeyDown} handleSend={handleSend} messages={messages} textareaRef={textareaRef} ai={ai}
        />
      </div>

      {/* ── Custom Dialogs & Toasts ────────────────────────────────────────── */}
      <CustomDialog
        isOpen={!!convToDelete}
        onClose={() => setConvToDelete(null)}
        onConfirm={() => {
          if (convToDelete) executeDeleteConversation(convToDelete.id);
        }}
        title="Delete conversation?"
        description={
          <div className="space-y-1">
            <p>
              Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-100 font-semibold">{convToDelete?.title || 'this chat'}</strong>?
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-[11px]">
              This will remove all {convToDelete?.messages?.length || 0} messages in this conversation. This action cannot be undone.
            </p>
          </div>
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        icon={Trash2}
      />

      <CustomDialog
        isOpen={showClearAllDialog}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={executeClearAllConversations}
        title="Clear all conversations?"
        description="Are you sure you want to delete all saved conversations? A clean new chat session will be started. This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        variant="danger"
        icon={Trash2}
      />

      <CustomDialog
        isOpen={!!convToRename}
        onClose={() => setConvToRename(null)}
        onConfirm={executeRenameConversation}
        title="Rename conversation"
        confirmText="Save"
        cancelText="Cancel"
        variant="info"
        icon={Pencil}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Conversation Title
          </label>
          <input
            type="text"
            value={renameTitleInput}
            onChange={(e) => setRenameTitleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executeRenameConversation();
              }
            }}
            autoFocus
            className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-[#00a870]"
            placeholder="Enter title..."
          />
        </div>
      </CustomDialog>

      <FloatToast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}

