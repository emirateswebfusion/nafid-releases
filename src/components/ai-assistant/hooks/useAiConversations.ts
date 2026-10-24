import React, { useEffect } from 'react';
import { type Conversation } from '../aiAssistantTypes';
import type { AiAssistantState } from './useAiAssistantState';

export interface UseAiConversationsContext {
  activeConversation: Conversation;
  activeConvId: string;
  conversations: Conversation[];
  setActiveConvId: React.Dispatch<React.SetStateAction<string>>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  ai: AiAssistantState;
}

/** Conversation management: new chat, rename, delete and clear-all dialogs, and the active-conversation sync effect. */
export function useAiConversations(ctx: UseAiConversationsContext) {
  const { activeConversation, activeConvId, conversations, setActiveConvId, setConversations, textareaRef } = ctx;
  const { convToRename, renameTitleInput, setConvToDelete, setConvToRename, setInput, setRenameTitleInput, setShowClearAllDialog, setToastMessage } = ctx.ai;
  const handleCreateNewChat = () => {
    // If the active conversation is already empty, do not create another one
    if (activeConversation && activeConversation.messages.length === 0) {
      if (textareaRef.current) textareaRef.current.focus();
      return;
    }

    // Check if there is already an empty conversation in the list
    const existingEmpty = conversations.find((c) => c.messages.length === 0);
    if (existingEmpty) {
      setActiveConvId(existingEmpty.id);
      setInput('');
      if (textareaRef.current) textareaRef.current.focus();
      return;
    }

    const newId = 'conv-' + Date.now();
    const newConv: Conversation = {
      id: newId,
      title: 'New chat',
      createdAt: Date.now(),
      messages: []
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
    setInput('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  // Ensure at most ONE empty chat exists on mount
  useEffect(() => {
    setConversations((prev) => {
      const withMessages = prev.filter((c) => c.messages && c.messages.length > 0);
      const emptyChats = prev.filter((c) => !c.messages || c.messages.length === 0);
      if (emptyChats.length > 1) {
        const keptEmpty = emptyChats.find((c) => c.id === activeConvId) || emptyChats[0];
        return [keptEmpty, ...withMessages];
      }
      return prev;
    });
  }, [setConversations]);

  const handleDeleteConversationClick = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    if (conv.messages && conv.messages.length > 0) {
      setConvToDelete(conv);
    } else {
      executeDeleteConversation(conv.id);
    }
  };

  const executeDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const freshId = 'conv-' + Date.now();
        const fresh: Conversation = {
          id: freshId,
          title: 'New chat',
          createdAt: Date.now(),
          messages: []
        };
        setActiveConvId(freshId);
        return [fresh];
      }
      if (activeConvId === id) {
        setActiveConvId(filtered[0].id);
      }
      return filtered;
    });
    setConvToDelete(null);
    setToastMessage({ text: 'Conversation deleted', type: 'info' });
  };

  const handleRenameConversationClick = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setConvToRename({ id: conv.id, title: conv.title || 'New chat' });
    setRenameTitleInput(conv.title || 'New chat');
  };

  const executeRenameConversation = () => {
    if (!convToRename) return;
    const newTitle = renameTitleInput.trim() || 'New chat';
    setConversations((prev) =>
      prev.map((c) => (c.id === convToRename.id ? { ...c, title: newTitle } : c))
    );
    setConvToRename(null);
    setToastMessage({ text: 'Conversation renamed successfully', type: 'success' });
  };

  const executeClearAllConversations = () => {
    const freshId = 'conv-' + Date.now();
    const fresh: Conversation = {
      id: freshId,
      title: 'New chat',
      createdAt: Date.now(),
      messages: []
    };
    setConversations([fresh]);
    setActiveConvId(freshId);
    setShowClearAllDialog(false);
    setToastMessage({ text: 'All conversations cleared', type: 'info' });
  };

  return { handleCreateNewChat, handleDeleteConversationClick, executeDeleteConversation, handleRenameConversationClick, executeRenameConversation, executeClearAllConversations };
}
