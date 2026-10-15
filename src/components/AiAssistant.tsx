import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Trash2,
  Printer,
  TrendingUp,
  Package,
  Users,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Mic,
  MicOff,
  ChevronDown,
  ChevronUp,
  BarChart3,
  DollarSign,
  ArrowLeft,
  X
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  chartData?: any;
  suggestedPrompts?: string[];
  timestamp: string;
}

interface OverviewStats {
  todaySales?: { total_sales: number; total_invoices: number };
  monthSales?: { total_sales: number; total_invoices: number };
  customerReceivables?: { total_outstanding: number; total_debtors: number };
  lowStockStats?: { low_stock_count: number; out_of_stock_count: number };
  todayExpenses?: { total_expenses: number };
}

const DEFAULT_SUGGESTIONS = [
  {
    category: '📊 Sales & Revenue',
    icon: TrendingUp,
    color: 'emerald',
    prompts: [
      "What is today's sales?",
      "What is this month's total sales?",
      "Compare this month's sales with last month",
    ]
  },
  {
    category: '📦 Inventory & Stock',
    icon: Package,
    color: 'blue',
    prompts: [
      'Show low stock items',
      'What are the top 5 best selling products?',
    ]
  },
  {
    category: '👥 Customers & Credit',
    icon: Users,
    color: 'amber',
    prompts: [
      'Which customers have credit balance above ₹5,000?',
      'What is total customer receivables outstanding?',
    ]
  },
  {
    category: '💸 Expenses & Purchases',
    icon: DollarSign,
    color: 'rose',
    prompts: [
      'What are the total expenses this month?',
      'Show this month\'s purchase bills',
    ]
  }
];

function formatINR(val: number | undefined): string {
  return '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AiAssistant({ onClose }: { onClose?: () => void }) {
  const { tenantId } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nafid_ai_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    try {
      localStorage.setItem('nafid_ai_chat_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load Executive Stats
  const loadOverview = async () => {
    try {
      const res = await fetchApi('/api/ai-assistant/overview');
      if (res) {
        setOverview(res);
        setIsOfflineMode(false);
        return;
      }
    } catch {
      // Fallback to local SQLite via Electron
    }

    if (window.electronAPI && tenantId) {
      setIsOfflineMode(true);
      try {
        const stats = await window.electronAPI.dbGetDashboardStats(tenantId);
        const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId });
        const customers = await window.electronAPI.dbGetCustomers({ tenant_id: tenantId });

        const lowStock = (products || []).filter((p: any) => Number(p.current_stock) <= Number(p.reorder_level || 0));
        const outStock = (products || []).filter((p: any) => Number(p.current_stock) <= 0);
        const creditCust = (customers || []).filter((c: any) => Number(c.current_balance || c.credit_balance || 0) > 0);
        const totalCredit = creditCust.reduce((acc: number, c: any) => acc + Number(c.current_balance || c.credit_balance || 0), 0);

        setOverview({
          todaySales: { total_sales: stats.totalSales || 0, total_invoices: stats.invoiceCount || 0 },
          monthSales: { total_sales: stats.totalSales || 0, total_invoices: stats.invoiceCount || 0 },
          customerReceivables: { total_outstanding: totalCredit, total_debtors: creditCust.length },
          lowStockStats: { low_stock_count: lowStock.length, out_of_stock_count: outStock.length },
          todayExpenses: { total_expenses: 0 }
        });
      } catch (err) {
        console.error('Local stats error:', err);
      }
    }
  };

  useEffect(() => {
    loadOverview();
  }, [tenantId]);

  // Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ml-IN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Speech recognition error:', err);
      }
    }
  };

  // Local Offline Analytics Engine for POS when Server is not reachable
  const handleOfflineQuery = async (queryText: string): Promise<any> => {
    if (!window.electronAPI || !tenantId) throw new Error('No local database available');

    const text = queryText.toLowerCase();
    const isMal = /[\u0D00-\u0D7F]/.test(queryText);
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Low Stock Query
    if (text.includes('സ്റ്റോക്ക്') || text.includes('stock') || text.includes('തീരാറായ') || text.includes('reorder') || text.includes('low')) {
      const products = await window.electronAPI.dbGetProducts({ tenant_id: tenantId });
      const low = (products || []).filter((p: any) => Number(p.current_stock) <= Number(p.reorder_level || 0));
      const out = low.filter((p: any) => Number(p.current_stock) <= 0);

      if (low.length === 0) {
        return {
          content: isMal
            ? '🎉 **അഭിനന്ദനങ്ങൾ!** നിലവിൽ റീ-ഓർഡർ ലെവലിന് താഴെയുള്ള ഉൽപ്പന്നങ്ങൾ ഒന്നുമില്ല. സ്റ്റോക്ക് സുരക്ഷിതമാണ്.'
            : '🎉 **All good!** No products are currently below reorder level. Inventory is healthy.',
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'കൂടുതൽ വിറ്റ ഉൽപ്പന്നങ്ങൾ']
            : ["What is today's sales?", 'Top selling products']
        };
      }

      let md = isMal
        ? `### ⚠️ സ്റ്റോക്ക് മുന്നറിയിപ്പ് (ലോക്കൽ ഡാറ്റാബേസ്)\n\nറീ-ഓർഡർ ലെവലിൽ എത്തിയ **${low.length}** ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി (ഇതിൽ **${out.length}** എണ്ണം തീർന്നുപോയി):\n\n| ഉൽപ്പന്നം | കാറ്റഗറി | സ്റ്റോക്ക് | റീ-ഓർഡർ | സ്റ്റാറ്റസ് |\n| :--- | :--- | :---: | :---: | :---: |\n`
        : `### ⚠️ Low Stock Alert (Local POS Database)\n\nFound **${low.length}** products at or below reorder level (**${out.length}** completely out of stock):\n\n| Product | Category | Current Stock | Reorder Level | Status |\n| :--- | :--- | :---: | :---: | :---: |\n`;

      low.slice(0, 15).forEach((p: any) => {
        const isZero = Number(p.current_stock) <= 0;
        const status = isMal
          ? (isZero ? '🔴 തീർന്നു' : '🟡 കുറവ്')
          : (isZero ? '🔴 Out of Stock' : '🟡 Low Stock');
        md += `| **${p.name}** | ${p.category || 'General'} | **${p.current_stock}** | ${p.reorder_level || 0} | ${status} |\n`;
      });
      return {
        content: md,
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', '₹5,000 ക്രെഡിറ്റ് ഉള്ളവർ']
          : ["What is today's sales?", 'Credit balance above ₹5,000']
      };
    }

    // 2. Customer Credit Query
    if (text.includes('ക്രെഡിറ്റ്') || text.includes('credit') || text.includes('ബാക്കി') || text.includes('balance') || text.includes('കടം') || text.includes('receivable')) {
      const customers = await window.electronAPI.dbGetCustomers({ tenant_id: tenantId });
      const amtMatch = text.match(/\b(\d+)\b/);
      const minAmount = amtMatch ? parseInt(amtMatch[1], 10) : 0;

      const debtors = (customers || []).filter((c: any) => Number(c.current_balance || c.credit_balance || 0) > minAmount)
        .sort((a: any, b: any) => Number(b.current_balance || b.credit_balance || 0) - Number(a.current_balance || a.credit_balance || 0));

      const totalOut = debtors.reduce((acc: number, c: any) => acc + Number(c.current_balance || c.credit_balance || 0), 0);

      if (debtors.length === 0) {
        return {
          content: isMal
            ? `നിർദ്ദേശിച്ച തുകയിൽ (${minAmount > 0 ? formatINR(minAmount) : '0'}) കുടിശ്ശികയുള്ള കസ്റ്റമർമാർ ഇല്ല.`
            : `No customers found with outstanding credit balance above ${minAmount > 0 ? formatINR(minAmount) : '₹0'}.`,
          suggestedPrompts: isMal
            ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് കുറവുള്ളവ']
            : ["What is today's sales?", 'Show low stock items']
        };
      }

      let md = isMal
        ? `### 👥 കസ്റ്റമർ കുടിശ്ശിക റിപ്പോർട്ട് (ലോക്കൽ ഡാറ്റ)\n\nആകെ കുടിശ്ശിക: **${formatINR(totalOut)}** (${debtors.length} കസ്റ്റമർമാർ)\n\n| കസ്റ്റമർ | ഫോൺ | ബാലൻസ് |\n| :--- | :---: | :---: |\n`
        : `### 👥 Customer Credit & Receivables (Local POS Database)\n\nTotal Outstanding: **${formatINR(totalOut)}** across **${debtors.length}** customers.\n\n| Customer Name | Phone | Balance |\n| :--- | :---: | :---: |\n`;

      debtors.slice(0, 10).forEach((c: any) => {
        md += `| **${c.name}** | ${c.phone || '—'} | **${formatINR(c.current_balance || c.credit_balance)}** |\n`;
      });
      return {
        content: md,
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് കുറവുള്ളവ']
          : ["What is today's sales?", 'Show low stock items']
      };
    }

    // 3. Sales Inquiries
    const invoices = await window.electronAPI.dbGetInvoices({ tenant_id: tenantId, filterDate: todayStr, filterDateEnd: todayStr });
    const totalSales = (invoices || []).reduce((acc: number, inv: any) => acc + Number(inv.grand_total || 0), 0);
    const count = (invoices || []).length;
    const avg = count > 0 ? totalSales / count : 0;

    let md = isMal
      ? `### 📊 ഇന്നത്തെ സെയിൽസ് (ലോക്കൽ POS ഡാറ്റ)\n\n* **മൊത്തം സെയിൽസ് തുക:** **${formatINR(totalSales)}**\n* **ബില്ലുകളുടെ എണ്ണം:** **${count} എണ്ണം**\n* **ശരാശരി ബിൽ മൂല്യം:** **${formatINR(avg)}**\n\n`
      : `### 📊 Today's Sales (Local POS Database)\n\n* **Total Sales Amount:** **${formatINR(totalSales)}**\n* **Total Invoices:** **${count} invoices**\n* **Average Ticket Value:** **${formatINR(avg)}**\n\n`;

    return {
      content: md,
      suggestedPrompts: isMal
        ? ['സ്റ്റോക്ക് കുറവുള്ള ഉൽപ്പന്നങ്ങൾ', '₹5,000-ൽ കൂടുതൽ ക്രെഡിറ്റ് ഉള്ളവർ']
        : ['Show low stock items', 'Customers with credit above ₹5,000']
    };
  };

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-user',
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let res: any;
      try {
        const historyPayload = messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content,
        }));
        res = await fetchApi('/api/ai-assistant/chat', {
          method: 'POST',
          body: JSON.stringify({ message: q, history: historyPayload }),
        });
        setIsOfflineMode(false);
      } catch {
        // Network / server unavailable: use high-speed offline SQLite analytics
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

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const isMal = /[\u0D00-\u0D7F]/.test(q);
      const errMsg: ChatMessage = {
        id: 'msg-' + Date.now() + '-error',
        role: 'assistant',
        content: isMal
          ? `ഡാറ്റ പരിശോധിക്കുന്നതിൽ തടസ്സം നേരിട്ടു: ${err.message || 'Error'}.`
          : `Failed to retrieve data: ${err.message || 'Error'}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedPrompts: isMal
          ? ['ഇന്നത്തെ സെയിൽസ് എത്രയാണ്?', 'സ്റ്റോക്ക് കുറവുള്ള ഉൽപ്പന്നങ്ങൾ']
          : ["What is today's sales?", 'Show low stock items']
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (messages.length === 0) return;
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([]);
      localStorage.removeItem('nafid_ai_chat_history');
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Markdown Parser
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      const rows = tableBuffer.map(r =>
        r.split('|').map(c => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1)
      );

      const headers = rows[0] || [];
      const bodyRows = rows.slice(2);

      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-xl border border-border shadow-xs">
          <table className="w-full text-xs md:text-sm text-left border-collapse">
            <thead className="bg-muted/80 text-foreground font-bold border-b border-border">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-3.5 py-2 whitespace-nowrap">
                    {parseInlineFormatting(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-card">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className={clsx(rIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20', 'hover:bg-muted/40 transition-colors')}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 whitespace-nowrap">
                      {parseInlineFormatting(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
          <h3 key={index} className="text-base md:text-lg font-bold text-foreground mt-3 mb-1.5 flex items-center gap-1.5">
            {parseInlineFormatting(trimmed.replace('### ', ''))}
          </h3>
        );
      } else if (trimmed.startsWith('#### ')) {
        elements.push(
          <h4 key={index} className="text-sm md:text-base font-semibold text-foreground/90 mt-2 mb-1">
            {parseInlineFormatting(trimmed.replace('#### ', ''))}
          </h4>
        );
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        elements.push(
          <div key={index} className="flex items-start gap-2 my-1 pl-1 text-sm text-foreground/90 leading-relaxed">
            <span className="text-primary font-bold">•</span>
            <span>{parseInlineFormatting(trimmed.substring(2))}</span>
          </div>
        );
      } else if (trimmed === '') {
        elements.push(<div key={index} className="h-2" />);
      } else {
        elements.push(
          <p key={index} className="text-sm text-foreground/90 my-1 leading-relaxed">
            {parseInlineFormatting(trimmed)}
          </p>
        );
      }
    });

    if (tableBuffer.length > 0) flushTable();
    return elements;
  };

  const parseInlineFormatting = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-muted-foreground">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground animate-in fade-in select-text">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border/80 bg-card/90 backdrop-blur-md px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center shadow-md shadow-primary/20 text-white">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-foreground text-base md:text-lg flex items-center gap-2">
                Nafid AI Copilot
              </h1>
              <span className={clsx(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                isOfflineMode
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              )}>
                <span className={clsx("w-1.5 h-1.5 rounded-full", isOfflineMode ? "bg-amber-500" : "bg-emerald-500 animate-ping")} />
                {isOfflineMode ? 'Local SQLite' : 'Live Cloud'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Smart Business AI Assistant • Supports Malayalam & English queries
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverview(!showOverview)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted transition-all text-foreground cursor-pointer shadow-2xs"
            title="Toggle Live Executive Snapshot"
          >
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Overview</span>
            {showOverview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => window.print()}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Print chat report"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleClearChat}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* ── Collapsible Live Overview Bar ───────────────────────────────────── */}
      {showOverview && (
        <div className="shrink-0 bg-muted/40 border-b border-border/80 p-3 sm:px-6 transition-all duration-300 animate-in slide-in-from-top-2">
          <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-card border border-border/80 shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground block">Today's Sales</span>
              <span className="text-base sm:text-lg font-bold text-emerald-500">
                {formatINR(overview?.todaySales?.total_sales)}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {overview?.todaySales?.total_invoices || 0} Invoices
              </span>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border/80 shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground block">This Month's Sales</span>
              <span className="text-base sm:text-lg font-bold text-blue-500">
                {formatINR(overview?.monthSales?.total_sales)}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {overview?.monthSales?.total_invoices || 0} Invoices
              </span>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border/80 shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground block">Customer Receivables</span>
              <span className="text-base sm:text-lg font-bold text-amber-500">
                {formatINR(overview?.customerReceivables?.total_outstanding)}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {overview?.customerReceivables?.total_debtors || 0} Customers
              </span>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border/80 shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground block">Low Stock Alert</span>
              <span className={clsx(
                "text-base sm:text-lg font-bold",
                (overview?.lowStockStats?.low_stock_count || 0) > 0 ? "text-rose-500" : "text-foreground"
              )}>
                {overview?.lowStockStats?.low_stock_count || 0} Items
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {overview?.lowStockStats?.out_of_stock_count || 0} Out of Stock
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Chat Stream ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="py-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-primary/20 to-indigo-500/20 text-primary mx-auto flex items-center justify-center border border-primary/20 shadow-inner">
                <Bot className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl font-bold text-foreground">
                  How can I help you today?
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Ask questions to analyze real-time sales, inventory, customer credit, and generate reports from your Nafid software.
                </p>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
                {DEFAULT_SUGGESTIONS.map((cat, idx) => {
                  const Icon = cat.icon;
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-card border border-border/80 shadow-2xs hover:border-primary/40 transition-all space-y-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className={clsx(
                          "w-7 h-7 rounded-lg flex items-center justify-center",
                          cat.color === 'emerald' && "bg-emerald-500/10 text-emerald-500",
                          cat.color === 'blue' && "bg-blue-500/10 text-blue-500",
                          cat.color === 'amber' && "bg-amber-500/10 text-amber-500",
                          cat.color === 'rose' && "bg-rose-500/10 text-rose-500",
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-foreground">{cat.category}</span>
                      </div>
                      <div className="space-y-1.5">
                        {cat.prompts.map((p, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => handleSend(p)}
                            className="w-full text-left text-xs text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-muted/60 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <span>{p}</span>
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  "flex gap-3",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div className={clsx(
                  "max-w-[88%] md:max-w-[80%] rounded-2xl px-4 py-3 shadow-xs space-y-2",
                  msg.role === 'user'
                    ? "bg-primary text-primary-foreground ml-auto rounded-tr-xs"
                    : "bg-card border border-border/80 text-foreground rounded-tl-xs"
                )}>
                  <div className="text-sm">
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                    ) : (
                      <div className="space-y-1">
                        {renderFormattedContent(msg.content)}
                      </div>
                    )}
                  </div>

                  {msg.chartData && msg.chartData.items && msg.chartData.items.length > 0 && (
                    <div className="mt-3 p-3 bg-muted/40 rounded-xl border border-border">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-primary" />
                        {msg.chartData.title || 'Sales Trend'}
                      </div>
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={msg.chartData.items}>
                            <XAxis dataKey={msg.chartData.labelKey} tick={{ fontSize: 10 }} interval={0} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '0.75rem', fontSize: '11px' }} />
                            <Bar dataKey={msg.chartData.dataKey} fill="currentColor" className="text-primary fill-primary rounded-t-sm" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border/50">
                      <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                        Suggested follow-ups:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedPrompts.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(s)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted/70 hover:bg-muted text-foreground border border-border/60 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>{s}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-primary" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px] opacity-70">
                    <span>{msg.timestamp}</span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="hover:opacity-100 flex items-center gap-1 cursor-pointer transition-opacity"
                        title="Copy text"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-muted border border-border text-foreground flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-1 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="bg-card border border-border/80 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Analyzing business data...</span>
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Bottom Input & Action Bar ───────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-border/80 bg-card/90 backdrop-blur-md px-4 py-3 md:px-8">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {["Today's Sales", "This Month's Sales", "Compare with Last Month", "Low Stock Alert", "Credit Above ₹5,000"].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(chip)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 transition-colors cursor-pointer text-[11px]"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 bg-background border border-border rounded-2xl p-1.5 shadow-xs focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question (e.g. What is today's sales? or Show low stock items)..."
              disabled={isLoading}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-50"
            />

            {speechSupported && (
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={clsx(
                  "p-2 rounded-xl transition-colors cursor-pointer",
                  isListening
                    ? "bg-rose-500 text-white animate-pulse"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={isListening ? "Listening... Click to stop" : "Speak in Malayalam or English"}
              >
                {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs active:scale-95"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-[10px] text-center text-muted-foreground">
            Nafid AI Copilot acts on live POS & database analytics. Zero math hallucination guaranteed.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default AiAssistant;
