import { cloudFetch } from './client';

/** Remote emergency wipe commands (cloud `/emergency`). */
export const emergencyCloud = {
  issueWipeCommand: (command: { password: string; target_terminal: string; wipe_mode: unknown }) =>
    cloudFetch<unknown>('/emergency/wipe-commands', { method: 'POST', body: JSON.stringify(command) }),
};
