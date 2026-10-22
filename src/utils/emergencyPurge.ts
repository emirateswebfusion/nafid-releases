export interface EmergencyPanicConfig {
  enabled: boolean;
  // Hotkey trigger
  hotkey_enabled: boolean;
  hotkey_combination: string; // e.g. 'Ctrl+Alt+Shift+X', 'Ctrl+Alt+Shift+Z', 'Ctrl+Shift+Delete'
  // Secret multi-click / tap gesture
  click_gesture_enabled: boolean;
  click_target: 'LOGO' | 'HEADER';
  click_count: number; // e.g. 5 rapid clicks within 2.5 seconds
  // Confirmation mode
  require_quick_pin: boolean; // false = instant wipe, true = requires 4-digit panic PIN
  panic_pin: string;
  // What to wipe
  wipe_mode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY'; // ALL_DATA = complete zero-slate reset
  auto_logout: boolean;
  updated_at?: string;
}

export const EMERGENCY_PANIC_CONFIG_KEY = 'emergency_panic_config';
export const EMERGENCY_WIPE_COMMAND_KEY = 'emergency_wipe_command';

export const DEFAULT_EMERGENCY_PANIC_CONFIG: EmergencyPanicConfig = {
  enabled: false,
  hotkey_enabled: true,
  hotkey_combination: 'Ctrl+Alt+Shift+X',
  click_gesture_enabled: true,
  click_target: 'LOGO',
  click_count: 5,
  require_quick_pin: false,
  panic_pin: '',
  wipe_mode: 'ALL_DATA',
  auto_logout: true,
};

export interface EmergencyWipeCommand {
  command_id: string;
  action: 'PURGE_LOCAL_DB';
  target_terminal: 'ALL' | string; // 'ALL' or specific terminalCode (e.g. 'POS1')
  triggered_by: string;
  triggered_at: number; // epoch ms
  wipe_mode: 'ALL_DATA' | 'SALES_AND_CASH_ONLY';
  status: 'PENDING' | 'EXECUTED';
}

export function parseEmergencyPanicConfig(val: any): EmergencyPanicConfig {
  if (!val) return DEFAULT_EMERGENCY_PANIC_CONFIG;
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_EMERGENCY_PANIC_CONFIG;
    return {
      enabled: Boolean(parsed.enabled),
      hotkey_enabled: parsed.hotkey_enabled !== false,
      hotkey_combination: parsed.hotkey_combination || DEFAULT_EMERGENCY_PANIC_CONFIG.hotkey_combination,
      click_gesture_enabled: parsed.click_gesture_enabled !== false,
      click_target: parsed.click_target === 'HEADER' ? 'HEADER' : 'LOGO',
      click_count: Number(parsed.click_count) || 5,
      require_quick_pin: Boolean(parsed.require_quick_pin),
      panic_pin: String(parsed.panic_pin || '').trim(),
      wipe_mode: parsed.wipe_mode === 'SALES_AND_CASH_ONLY' ? 'SALES_AND_CASH_ONLY' : 'ALL_DATA',
      auto_logout: parsed.auto_logout !== false,
      updated_at: parsed.updated_at,
    };
  } catch {
    return DEFAULT_EMERGENCY_PANIC_CONFIG;
  }
}

export function isMatchingHotkey(event: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  const parts = combo.toLowerCase().split('+').map(p => p.trim());
  const needsCtrl = parts.includes('ctrl') || parts.includes('control');
  const needsAlt = parts.includes('alt');
  const needsShift = parts.includes('shift');
  const needsMeta = parts.includes('cmd') || parts.includes('meta') || parts.includes('win');

  if (needsCtrl !== (event.ctrlKey || event.metaKey)) return false;
  if (needsAlt !== event.altKey) return false;
  if (needsShift !== event.shiftKey) return false;
  if (needsMeta && !event.metaKey) return false;

  const keyPart = parts.find(p => !['ctrl', 'control', 'alt', 'shift', 'cmd', 'meta', 'win'].includes(p));
  if (!keyPart) return true;

  const eventKey = event.key.toLowerCase();
  if (keyPart === 'delete' || keyPart === 'del') return eventKey === 'delete';
  if (keyPart === 'escape' || keyPart === 'esc') return eventKey === 'escape';
  if (keyPart === 'backspace') return eventKey === 'backspace';

  return eventKey === keyPart;
}
