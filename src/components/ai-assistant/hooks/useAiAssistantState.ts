import { useState } from 'react';
import { type Conversation } from '../aiAssistantTypes';
import { type ToastMessage } from '../../ui/FloatToast';

/**
 * State of the AI assistant: input, sending / speaking flags, language mode, sidebar, rename / delete / clear dialogs
 * and copy feedback (conversations and the active id stay in the page: they start from local storage).
 */
export function useAiAssistantState() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [languageMode, setLanguageMode] = useState<'en' | 'ml'>('en');
  const [showPromptMenu, setShowPromptMenu] = useState(false);
  // Custom dialogue and toast states
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [convToRename, setConvToRename] = useState<{ id: string; title: string } | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState('');
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  return {
    sidebarOpen, setSidebarOpen, input, setInput, isLoading, setIsLoading, copiedId, setCopiedId, speakingId,
    setSpeakingId, languageMode, setLanguageMode, showPromptMenu, setShowPromptMenu,
    convToDelete, setConvToDelete, convToRename, setConvToRename, renameTitleInput, setRenameTitleInput,
    showClearAllDialog, setShowClearAllDialog, toastMessage, setToastMessage,
  };
}

export type AiAssistantState = ReturnType<typeof useAiAssistantState>;
