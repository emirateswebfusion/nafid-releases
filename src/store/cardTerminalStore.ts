import { create } from 'zustand';

/**
 * The card machine dialog. The payment step (`components/app/cardTerminalStep.ts`) shows a prompt and
 * awaits the cashier's choice; `CardTerminalDialog` renders the prompt and answers it.
 */
export interface CardTerminalAction {
  id: string;
  label: string;
  tone?: 'primary' | 'danger' | 'neutral';
  /** Needs the text input filled (e.g. the auth code from the slip). */
  requiresInput?: boolean;
}

export interface CardTerminalPrompt {
  title: string;
  amount: number;
  message: string;
  tone: 'waiting' | 'success' | 'error' | 'warning';
  /** Shows a Cancel button that aborts the running terminal request. */
  cancellable?: boolean;
  actions: CardTerminalAction[];
  input?: { label: string; placeholder?: string };
}

export interface CardTerminalChoice { action: string; input: string }

interface CardTerminalState {
  prompt: CardTerminalPrompt | null;
  status: string;
  resolver: ((choice: CardTerminalChoice) => void) | null;
  /** Show a prompt with actions and wait for the cashier. */
  ask: (prompt: CardTerminalPrompt) => Promise<CardTerminalChoice>;
  /** Show a prompt without actions (waiting for the terminal). */
  show: (prompt: CardTerminalPrompt) => void;
  setStatus: (status: string) => void;
  answer: (choice: CardTerminalChoice) => void;
  close: () => void;
}

export const useCardTerminalStore = create<CardTerminalState>((set, get) => ({
  prompt: null,
  status: '',
  resolver: null,
  ask: prompt => new Promise<CardTerminalChoice>(resolve => {
    get().resolver?.({ action: 'close', input: '' });
    set({ prompt, status: '', resolver: resolve });
  }),
  show: prompt => set({ prompt, status: '', resolver: null }),
  setStatus: status => set({ status }),
  answer: choice => {
    const { resolver } = get();
    set({ resolver: null });
    resolver?.(choice);
  },
  close: () => {
    get().resolver?.({ action: 'close', input: '' });
    set({ prompt: null, status: '', resolver: null });
  },
}));
