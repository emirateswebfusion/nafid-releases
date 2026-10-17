import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus,
  ArrowUp,
  Trash2,
  Copy,
  Check,
  Volume2,
  VolumeX,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeft,
  X,
  Wifi,
  WifiOff,
  BarChart3,
  RefreshCw,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Pencil,
  RotateCcw
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { processOfflineAiQuery } from '../services/offlineAiService';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';
import { CustomDialog } from './ui/CustomDialog';
import { FloatToast, type ToastMessage } from './ui/FloatToast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  chartData?: {
    title?: string;
    labelKey: string;
    dataKey: string;
    items: Array<Record<string, any>>;
  };
  suggestedPrompts?: string[];
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

function formatINR(val: number | undefined): string {
  return '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function humanizeKey(key: string): string {
  if (!key) return '';
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAiConversationsStorageKey(tenantId: string | null | undefined, userId: string | null | undefined): string {
  const t = (tenantId || 'global').trim();
  const u = (userId || 'user').trim();
  return `nafid_ai_convs_${t}_${u}`;
}

function getAiActiveConvIdStorageKey(tenantId: string | null | undefined, userId: string | null | undefined): string {
  const t = (tenantId || 'global').trim();
  const u = (userId || 'user').trim();
  return `nafid_ai_active_conv_${t}_${u}`;
}

// 100% Genuine Nafid Business Intelligence System Queries
const BENTO_CARDS_EN = [
  {
    icon: TrendingUp,
    title: "Today's Sales & Bills",
    description: "View total revenue, invoices count, and average bill value today",
    prompt: "What is today's sales and bill count?"
  },
  {
    icon: Package,
    title: "Low Stock Alerts",
    description: "List inventory products that have reached or dropped below reorder level",
    prompt: "Show low stock items below reorder level"
  },
  {
    icon: Users,
    title: "Customer Credit & Debtors",
    description: "Find credit customers with pending balances above ₹5,000",
    prompt: "Which customers have credit balance above ₹5,000?"
  },
  {
    icon: DollarSign,
    title: "Monthly Revenue & Growth",
    description: "Calculate this month's total sales turnover and compare with last month",
    prompt: "What is this month's total sales revenue?"
  }
];

const BENTO_CARDS_ML = [
  {
    icon: TrendingUp,
    title: "ഇന്നത്തെ സെയിൽസ് & ബില്ലുകൾ",
    description: "ഇന്നത്തെ ആകെ സെയിൽസ് തുകയും ബില്ലുകളുടെ എണ്ണവും പരിശോധിക്കുക",
    prompt: "ഇന്നത്തെ മൊത്തം സെയിൽസ് എത്രയാണ്?"
  },
  {
    icon: Package,
    title: "സ്റ്റോക്ക് മുന്നറിയിപ്പ്",
    description: "റീ-ഓർഡർ ലെവലിൽ എത്തിയതും തീരാറായതുമായ ഉൽപ്പന്നങ്ങൾ കാണിക്കുക",
    prompt: "സ്റ്റോക്ക് തീരാറായ ഉൽപ്പന്നങ്ങൾ കാണിക്കുക"
  },
  {
    icon: Users,
    title: "കസ്റ്റമർ കുടിശ്ശിക (കടം)",
    description: "₹5,000-ൽ കൂടുതൽ ബാക്കി കടമുള്ള കസ്റ്റമേഴ്സിന്റെ വിവരങ്ങൾ",
    prompt: "₹5,000-ൽ കൂടുതൽ കടം ബാക്കിയുള്ള കസ്റ്റമേഴ്സ് ആരെല്ലാം?"
  },
  {
    icon: DollarSign,
    title: "പ്രതിമാസ സെയിൽസ് വിവരങ്ങൾ",
    description: "ഈ മാസത്തെ മൊത്തം സെയിൽസ് വരുമാനം ഒറ്റനോട്ടത്തിൽ അറിയുക",
    prompt: "ഈ മാസത്തെ ആകെ സെയിൽസ് വിവരങ്ങൾ കാണിക്കുക"
  }
];

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
    } catch {}
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
    } catch {}
    return conversations[0]?.id || 'conv-1';
  });

  // Whenever switching account (user or tenant), reload only this account's conversations
  useEffect(() => {
    // Purge legacy un-scoped chat storage to eliminate cross-account leakage
    try {
      localStorage.removeItem('nafid_pos_ai_conversations_v3');
      localStorage.removeItem('nafid_pos_ai_active_conv_id_v3');
      localStorage.removeItem('nafid_pos_ai_conversations');
    } catch {}

    const loaded = loadConversationsFromStorage();
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

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [languageMode, setLanguageMode] = useState<'en' | 'ml'>('en');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showPromptMenu, setShowPromptMenu] = useState(false);

  // Custom dialogue and toast states
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [convToRename, setConvToRename] = useState<{ id: string; title: string } | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState('');
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist conversations strictly scoped to active tenant & user account
  useEffect(() => {
    try {
      localStorage.setItem(convStorageKey, JSON.stringify(conversations));
      localStorage.setItem(activeIdStorageKey, activeConvId);
    } catch {}
  }, [conversations, activeConvId, convStorageKey, activeIdStorageKey]);

  const activeConversation = useMemo(() => {
    const found = conversations.find((c) => c.id === activeConvId);
    return found || conversations[0];
  }, [conversations, activeConvId]);

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
        handleCreateNewChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);



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
  }, []);

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
        res = await fetchApi('/api/ai-assistant/chat', {
          method: 'POST',
          body: JSON.stringify({ message: q, history: historyPayload }),
        });
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
    } catch (err: any) {
      console.error('Chat error:', err);
      const isMal = /[\u0D00-\u0D7F]/.test(q);
      const errMsg: ChatMessage = {
        id: 'msg-' + Date.now() + '-error',
        role: 'assistant',
        content: isMal ? `ഡാറ്റ പരിശോധിക്കുന്നതിൽ തടസ്സം നേരിട്ടു: ${err.message || 'Error'}.` : `Failed to retrieve data: ${err.message || 'Error'}.`,
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

  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      const fullTableString = tableBuffer.join('\n');
      const rows = tableBuffer.map((r) =>
        r.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1)
      );

      const headers = rows[0] || [];
      const alignRow = rows[1] || [];
      const bodyRows = rows.slice(2);

      // Determine column alignments so headers and cells align properly
      const colAlignments = headers.map((h, i) => {
        const alignCell = (alignRow[i] || '').trim();
        if (alignCell.startsWith(':') && alignCell.endsWith(':')) return 'center';
        if (alignCell.endsWith(':')) return 'right';
        if (alignCell.startsWith(':')) return 'left';
        // Auto-detect based on body cells or header name
        let hasNumberOrCurrency = false;
        for (const r of bodyRows) {
          const val = (r[i] || '').replace(/\*+/g, '').trim();
          if (/^[₹$]?\s*[\d,]+(\.\d+)?(\s*[a-zA-Z/%]+)?$/.test(val)) {
            hasNumberOrCurrency = true;
            break;
          }
        }
        if (hasNumberOrCurrency || /amount|total|price|rate|cost|balance|due|qty|quantity/i.test(h)) {
          return 'right';
        }
        return 'left';
      });

      elements.push(
        <div key={`table-${elements.length}`} className="my-3 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-xs w-full">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Table Data</span>
            </div>
            <button
              onClick={() => handleCopyTableCSV(fullTableString)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-2 py-0.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Copy as CSV"
            >
              <Copy className="w-3 h-3" />
              <span>Copy CSV</span>
            </button>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300 font-semibold">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={clsx(
                        "px-3.5 py-2.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-gray-500",
                        colAlignments[i] === 'right' ? 'text-right' : colAlignments[i] === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {parseInlineFormatting(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className={clsx(rIdx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-gray-50/30 dark:bg-zinc-800/20', 'hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors')}>
                    {row.map((cell, cIdx) => {
                      const isRight = colAlignments[cIdx] === 'right';
                      const isCenter = colAlignments[cIdx] === 'center';
                      return (
                        <td
                          key={cIdx}
                          className={clsx(
                            'px-3.5 py-2.5 whitespace-nowrap text-gray-800 dark:text-gray-200 font-medium',
                            isRight && 'tabular-nums font-mono text-right',
                            isCenter && 'text-center',
                            !isRight && !isCenter && 'text-left'
                          )}
                        >
                          {parseInlineFormatting(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      tableBuffer = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        tableBuffer.push(trimmed);
        return;
      } else if (tableBuffer.length > 0) {
        flushTable();
      }

      if (trimmed.startsWith('### ')) {
        elements.push(
          <div key={index} className="mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-emerald-600" />
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">{parseInlineFormatting(trimmed.replace('### ', ''))}</h3>
          </div>
        );
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        elements.push(
          <div key={index} className="flex items-start gap-2.5 my-1.5 pl-1 text-xs md:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
            <span>{parseInlineFormatting(trimmed.substring(2))}</span>
          </div>
        );
      } else if (trimmed === '') {
        elements.push(<div key={index} className="h-1.5" />);
      } else {
        elements.push(
          <p key={index} className="text-xs md:text-sm text-gray-700 dark:text-gray-300 my-1 leading-relaxed">
            {parseInlineFormatting(trimmed)}
          </p>
        );
      }
    });

    if (tableBuffer.length > 0) flushTable();
    return elements;
  };

  const parseInlineFormatting = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-gray-500">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 border border-gray-200 dark:border-zinc-700">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const bentoCards = languageMode === 'ml' ? BENTO_CARDS_ML : BENTO_CARDS_EN;

  return (
    <div className="h-full w-full min-w-0 flex bg-[#fbfbfb] dark:bg-zinc-950 text-gray-900 dark:text-gray-100 overflow-hidden font-sans select-text">
      {/* ── Left Sidebar ────────────────────────────────────────────────────── */}
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
            <span className={clsx("w-2 h-2 rounded-full", isOfflineMode ? "bg-amber-500" : "bg-emerald-500")} />
            <span className="text-[11px] font-medium">{isOfflineMode ? 'Offline Mode' : 'Live Cloud'}</span>
          </div>
          <button
            onClick={() => setLanguageMode((prev) => (prev === 'en' ? 'ml' : 'en'))}
            className="text-[11px] font-mono uppercase px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            {languageMode === 'en' ? 'EN' : 'മലയാളം'}
          </button>
        </div>
      </aside>

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
          {messages.length === 0 ? (
            <div className="my-auto py-8 flex flex-col items-center text-center animate-in fade-in-50 duration-400 w-full max-w-3xl lg:max-w-4xl mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-[#00a870] flex items-center justify-center text-white shadow-sm mb-5">
                <span className="text-2xl font-black leading-none select-none">✱</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-2">
                What can I help with?
              </h1>

              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
                {languageMode === 'en'
                  ? "Query real-time sales, inventory alerts, customer debt, and expenses."
                  : "സെയിൽസ്, സ്റ്റോക്ക്, കസ്റ്റമർ കടം എന്നിവ ചോദിക്കാം."}
              </p>

              {/* 100% Genuine Nafid Business Intelligence System Bento Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left">
                {bentoCards.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSend(card.prompt)}
                      className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200/90 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 hover:shadow-xs transition-all text-left flex flex-col justify-between cursor-pointer group min-h-[96px]"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-emerald-600 transition-colors" />
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {card.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal line-clamp-2">
                        {card.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="w-full flex-1 flex flex-col space-y-6 pb-6 min-w-0 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      "w-full flex animate-in fade-in-30 duration-300 min-w-0",
                      isUser ? "justify-end" : "justify-start"
                    )}
                  >
                    {/* NO USER ICON / NO ASSISTANT ICON */}
                    <div
                      className={clsx(
                        "space-y-2 transition-all min-w-0",
                        isUser
                          ? "max-w-[85%] sm:max-w-[75%] md:max-w-[65%] rounded-2xl px-5 py-3.5 bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 text-sm font-normal shadow-2xs"
                          : "w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl text-gray-900 dark:text-gray-100 text-sm leading-relaxed"
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                      ) : (
                        <div className="space-y-2 w-full min-w-0">
                          {renderFormattedContent(msg.content)}
                        </div>
                      )}

                      {!isUser && msg.chartData && msg.chartData.items && msg.chartData.items.length > 0 && (
                        <div className="my-3 p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 w-full">
                          <div className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{msg.chartData.title || 'Analytics Breakdown'}</span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-400 uppercase">
                              {msg.chartData.items.length} Points
                            </span>
                          </div>
                          <div className="h-52 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={msg.chartData.items} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                                <XAxis
                                  dataKey={msg.chartData.labelKey}
                                  tick={{ fontSize: 10, fill: 'currentColor' }}
                                  className="text-gray-400 font-medium"
                                  interval={0}
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: 'currentColor' }}
                                  className="text-gray-400 font-mono"
                                  tickFormatter={(val) => {
                                    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                                    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                                    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                                    return `₹${val}`;
                                  }}
                                />
                                <Tooltip
                                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                  contentStyle={{
                                    backgroundColor: '#18181b',
                                    borderColor: '#27272a',
                                    borderRadius: '0.75rem',
                                    fontSize: '11px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                    padding: '8px 12px',
                                    color: '#f4f4f5',
                                  }}
                                  itemStyle={{ color: '#00a870', fontWeight: 600, fontSize: '12px' }}
                                  labelStyle={{ color: '#a1a1aa', fontWeight: 700, marginBottom: '4px', fontSize: '11px' }}
                                  formatter={(value: any, name: any) => {
                                    const rawName = String(name || msg.chartData?.dataKey || '');
                                    const label = humanizeKey(rawName);
                                    const num = Number(value) || 0;
                                    const isCurrency = /amount|total|sales|price|cost|rate|revenue|balance|due/i.test(rawName);
                                    const valStr = isCurrency ? formatINR(num) : num.toLocaleString('en-IN');
                                    return [valStr, label];
                                  }}
                                />
                                <Bar
                                  dataKey={msg.chartData.dataKey}
                                  name={humanizeKey(msg.chartData.dataKey)}
                                  fill="#00a870"
                                  radius={[6, 6, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {!isUser && msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                        <div className="pt-2 flex flex-wrap gap-1.5">
                          {msg.suggestedPrompts.map((s, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSend(s)}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-800 transition-colors cursor-pointer"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {!isUser && (
                        <div className="flex items-center gap-3 pt-2 text-[11px] text-gray-400">
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600 font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleSpeak(msg.id, msg.content)}
                            className={clsx(
                              "flex items-center gap-1 cursor-pointer transition-colors",
                              speakingId === msg.id ? "text-emerald-600 font-medium" : "hover:text-gray-700 dark:hover:text-gray-200"
                            )}
                            title="Read aloud"
                          >
                            {speakingId === msg.id ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
                                <span className="text-emerald-600">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>Listen</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400 animate-pulse pt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" />
                  <span className="ml-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                    {languageMode === 'ml' ? 'വിവരങ്ങൾ പരിശോധിക്കുന്നു...' : 'Analyzing store records...'}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom Floating Input Deck ─────────────────────────────────────── */}
        <footer className="shrink-0 p-3 sm:p-4 md:pb-6 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xs w-full">
          <div
            className={clsx(
              "w-full mx-auto space-y-2 transition-all duration-300 min-w-0",
              messages.length === 0
                ? "max-w-3xl lg:max-w-4xl"
                : "max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
            )}
          >
            {showPromptMenu && (
              <div className="p-2 mb-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-lg space-y-1 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Nafid System Inquiries
                </div>
                {[
                  "What is today's sales and bill count?",
                  "What is this month's total sales revenue?",
                  "Compare this month's sales with last month",
                  "Show low stock items below reorder level",
                  "Which items are completely out of stock?",
                  "Which customers have credit balance above ₹5,000?",
                  "What is total customer receivables outstanding?",
                  "What are the total shop expenses recorded this month?"
                ].map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(p)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
              className="no-focus-ring bg-white dark:bg-zinc-900 border-0 outline-none ring-0 focus-within:ring-0 focus-within:outline-none focus-within:border-0 rounded-2xl sm:rounded-3xl p-3 shadow-xs transition-all w-full"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  languageMode === 'en'
                    ? "Ask about sales, stock alerts, customer credit, or expenses..."
                    : "സെയിൽസ്, സ്റ്റോക്ക്, കസ്റ്റമർ കടം എന്നിവ ചോദിക്കാം..."
                }
                disabled={isLoading}
                style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                className="no-focus-ring w-full bg-transparent px-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 border-0 border-none outline-none ring-0 focus:border-0 focus:border-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none focus:shadow-none resize-none min-h-[36px] max-h-[140px] leading-relaxed disabled:opacity-50"
              />

              <div className="flex items-center justify-between pt-2 px-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPromptMenu(!showPromptMenu)}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="System Inquiries"
                  >
                    <Plus className="w-4 h-4" />
                  </button>


                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-medium select-none">
                    AI Assistant
                  </span>

                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="w-8 h-8 rounded-xl bg-gray-300 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="Send (Enter)"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowUp className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </form>

            <p className="text-[11px] text-center text-gray-400 dark:text-zinc-500 select-none">
              {languageMode === 'en'
                ? "NAFID AI can make mistakes. Verify important business and financial info."
                : "പ്രധാന ബിസിനസ്സ് കണക്കുകളും വിവരങ്ങളും ആവശ്യമെങ്കിൽ പരിശോധിച്ച് ഉറപ്പുവരുത്തുക."}
            </p>
          </div>
        </footer>
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

export default AiAssistant;
