import { localizeCurrencyText } from '../../../utils/localization/storeProfile';
import React from 'react';
import clsx from 'clsx';
import { Plus, RefreshCw, ArrowUp } from 'lucide-react';
import type { ChatMessage } from '../aiAssistantTypes';
import type { AiAssistantState } from '../hooks/useAiAssistantState';

export interface AiComposerProps {
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSend: (textToSend?: string) => Promise<void>;
  messages: ChatMessage[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  ai: AiAssistantState;
}

/** Bottom input deck: message box, language toggle, voice / send controls. */
export function AiComposer({
  handleKeyDown, handleSend, messages, textareaRef, ai,
}: AiComposerProps) {
  const { input, isLoading, languageMode, setInput, setShowPromptMenu, showPromptMenu } = ai;
  return (
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
              localizeCurrencyText("Which customers have credit balance above ₹5,000?"),
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
  );
}
