import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type { SettingsSaveSession } from '../settingsSaveSession';
export const SettingsSaveContext = createContext<{ session: SettingsSaveSession; changed: () => void } | null>(null);
/** Register draft persistence with the sole Settings Save Changes action. */
export function useSettingsSectionSave(dirty: boolean, save: () => Promise<void>) {
  const context = useContext(SettingsSaveContext);
  const id = useId();
  const latest = useRef(save);
  useEffect(() => { latest.current = save; });
  useEffect(() => {
    if (!context) return;
    context.session.update({ id, dirty, save: () => latest.current() });
    context.changed();
    return () => { context.session.remove(id); context.changed(); };
  }, [context, id, dirty]);
}
