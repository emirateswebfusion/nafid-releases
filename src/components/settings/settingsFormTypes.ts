import type { useSettingsFormState } from './hooks/useSettingsFormState';

/** Everything the settings form holds (values and setters), as returned by useSettingsFormState. Tab props use
 * `SettingsForm['name']` so they always match the form state. */
export type SettingsForm = ReturnType<typeof useSettingsFormState>;
