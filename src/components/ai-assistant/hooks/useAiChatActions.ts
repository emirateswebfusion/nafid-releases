import type React from 'react';
import { processOfflineAiQuery } from '../../../services/offlineAiService';
import { type ChatMessage } from '../aiAssistantTypes';
import { aiAssistantCloud } from '../../../data/cloud/aiAssistant';
import type { Conversation } from '../aiAssistantTypes';
import type { AiAssistantState } from './useAiAssistantState';

export interface UseAiChatActionsContext {
  activeConvId: string;
  messages: ChatMessage[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  tenantId: string | null;
  ai: AiAssistantState;
}

/** Chat actions: send (online / offline), keyboard submit, copy text or table CSV, and speak a reply. */
export function useAiChatActions(ctx: UseAiChatActionsContext) {
  const { activeConvId, messages, setConversations, tenantId } = ctx;
  const { input, isLoading, setCopiedId, setInput, setIsLoading, setIsOfflineMode, setLanguageMode, setShowPromptMenu, setSpeakingId, setToastMessage, speakingId } = ctx.ai;
  const handleSpeak = (id: string, text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/[#*`_~|]/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = /[\u0D00-\u0D7F]/.test(text) ? 'ml-IN' : 'en-IN';
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyTableCSV = (tableMarkdown: string) => {
    const lines = tableMarkdown.trim().split('\n');
    const csvRows = lines
      .filter((l) => l.trim().startsWith('|') && !l.includes('---'))
      .map((l) => {
        const cells = l.split('|').map((c) => c.trim()).filter((_, i, arr) => i !== 0 && i !== arr.length - 1);
        return cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
      });
    navigator.clipboard.writeText(csvRows.join('\n'));
    setToastMessage({ text: 'Table copied to clipboard as CSV format', type: 'success' });
  };

  // Local Offline Analytics for POS
  const handleOfflineQuery = async (queryText: string): Promise<any> => {
    if (!tenantId) throw new Error('No active store selected');
    const historyPayload = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return await processOfflineAiQuery(queryText, tenantId, historyPayload);
  };

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isLoading) return;

    if (/[\u0D00-\u0D7F]/.test(q)) {
      setLanguageMode('ml');
    }

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-user',
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          const isInitial = c.messages.length === 0 || c.title === 'New chat' || c.title === 'Getting started with AI';
          const newTitle = isInitial ? (q.length > 28 ? q.slice(0, 28) + '...' : q) : c.title;
          return {
            ...c,
            title: newTitle,
            messages: [...c.messages, userMsg],
          };
        }
        return c;
      })
    );

    setInput('');
    setShowPromptMenu(false);
    setIsLoading(true);

    try {
      let res: any;
      try {
        const historyPayload = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        res = await aiAssistantCloud.chat(q, historyPayload);
        setIsOfflineMode(false);
      } catch {
        res = await handleOfflineQuery(q);
        setIsOfflineMode(true);
      }

      const assistantMsg: ChatMessage = {
        id: 'msg-' + Date.now() + '-assistant',
        role: 'assistant',
        content: res.content || res.reply || 'No data available.',
        data: res.data,
        chartData: res.chartData,
        suggestedPrompts: res.suggestedPrompts || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
            };
          }
          return c;
        })
      );
    } catch (err) {
      console.error('Chat error:', err);
      const isMal = /[\u0D00-\u0D7F]/.test(q);
      const errMsg: ChatMessage = {
        id: 'msg-' + Date.now() + '-error',
        role: 'assistant',
        content: isMal ? `ഡാറ്റ പരിശോധിക്കുന്നതിൽ തടസ്സം നേരിട്ടു: ${(err as Error).message || 'Error'}.` : `Failed to retrieve data: ${(err as Error).message || 'Error'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, errMsg],
            };
          }
          return c;
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return { handleSpeak, handleCopy, handleCopyTableCSV, handleSend, handleKeyDown };
}
