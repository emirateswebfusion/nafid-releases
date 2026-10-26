import { cloudFetch } from './client';

/** AI business assistant (cloud `/api/ai-assistant`). */
export const aiAssistantCloud = {
  chat: (message: string, history: unknown) =>
    cloudFetch<unknown>('/api/ai-assistant/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
};
