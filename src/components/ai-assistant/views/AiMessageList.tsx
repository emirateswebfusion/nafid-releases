import React from 'react';
import clsx from 'clsx';
import { BarChart3, Check, Copy, VolumeX, Volume2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { humanizeKey } from '../aiAssistantTypes';
import { formatCurrency as formatINR } from '../../../utils/money';
import type { ChatMessage } from '../aiAssistantTypes';
import type { LucideProps } from 'lucide-react';
import type { AiAssistantState } from '../hooks/useAiAssistantState';

export interface AiMessageListProps {
  bentoCards: { icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; title: string; description: string; prompt: string; }[];
  handleCopy: (id: string, text: string) => void;
  handleSend: (textToSend?: string) => Promise<void>;
  handleSpeak: (id: string, text: string) => void;
  messages: ChatMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  renderFormattedContent: (content: string) => React.ReactNode[];
  ai: AiAssistantState;
}

/** Chat body: the starter cards when empty, otherwise the messages with formatted text, charts and per-message actions. */
export function AiMessageList({
  bentoCards, handleCopy, handleSend, handleSpeak, messages, messagesEndRef, renderFormattedContent, ai,
}: AiMessageListProps) {
  const { copiedId, isLoading, languageMode, speakingId } = ai;
  return (
    <>
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
    </>
  );
}
