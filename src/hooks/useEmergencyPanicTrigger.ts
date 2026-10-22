import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  DEFAULT_EMERGENCY_PANIC_CONFIG, 
  EMERGENCY_PANIC_CONFIG_KEY, 
  parseEmergencyPanicConfig, 
  isMatchingHotkey,
  type EmergencyPanicConfig 
} from '../utils/emergencyPurge';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { hasBridge } from '../data/client';
import { bridgeEvents } from '../data/events';
import { recycleBinApi } from '../data/recycleBin';
import { settingsApi } from '../data/settings';

export function useEmergencyPanicTrigger() {
  const [panicConfig, setPanicConfig] = useState<EmergencyPanicConfig>(DEFAULT_EMERGENCY_PANIC_CONFIG);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const clickCountRef = useRef<number>(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<EmergencyPanicConfig>(panicConfig);
  configRef.current = panicConfig;

  // Load panic configuration from settings
  useEffect(() => {
    const loadConfig = () => {
      if (hasBridge('settingsGet')) {
        const { tenantId } = useAuthStore.getState();
        settingsApi.get({ tenant_id: tenantId || 'global', key: EMERGENCY_PANIC_CONFIG_KEY })
          .then((val: any) => {
            if (val) setPanicConfig(parseEmergencyPanicConfig(val));
          })
          .catch(() => {});
      }
    };

    loadConfig();
    window.addEventListener('settings:updated', loadConfig);
    return () => window.removeEventListener('settings:updated', loadConfig);
  }, []);

  const executePurge = useCallback(async (reason: string = 'LOCAL_PANIC') => {
    if (isPurging) return;
    setIsPurging(true);
    setShowPinPrompt(false);

    try {
      console.warn(`[PanicTrigger] 🚨 Executing local emergency purge. Reason: ${reason}`);
      if (hasBridge('dbEmergencyPurge')) {
        await recycleBinApi.emergencyPurge({
          wipe_mode: configRef.current.wipe_mode,
          reason,
        });
      }

      // Clear client state
      useCartStore.getState().clearCart?.();
      useAuthStore.getState().logout();
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}

      // Hard reload to clean login screen
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname;
      }, 300);
    } catch (err) {
      console.error('[PanicTrigger] Purge execution error:', err);
      setIsPurging(false);
    }
  }, [isPurging]);

  // Listen for broadcasted purge events from sync or another trigger
  useEffect(() => {
    if (!hasBridge('onEmergencyPurged')) return;
    const unsub = bridgeEvents.onEmergencyPurged(() => {
      useCartStore.getState().clearCart?.();
      useAuthStore.getState().logout();
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname;
      }, 300);
    });
    return () => { unsub(); };
  }, []);

  // Hotkey listener
  useEffect(() => {
    if (!panicConfig.enabled || !panicConfig.hotkey_enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMatchingHotkey(e, panicConfig.hotkey_combination)) {
        e.preventDefault();
        e.stopPropagation();

        if (panicConfig.require_quick_pin && panicConfig.panic_pin) {
          setShowPinPrompt(true);
          setEnteredPin('');
          setPinError(false);
        } else {
          executePurge('HOTKEY_TRIGGER');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [panicConfig, executePurge]);

  // Secret multi-click / tap listener on store logo or elements marked data-panic-click
  useEffect(() => {
    if (!panicConfig.enabled || !panicConfig.click_gesture_enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isPanicTarget = 
        target.closest('[data-panic-click="true"]') ||
        target.closest('[data-panic-target="LOGO"]') ||
        target.closest('header .cursor-pointer') ||
        (panicConfig.click_target === 'LOGO' && target.closest('.shop-logo-container, .brand-logo'));

      if (!isPanicTarget) return;

      clickCountRef.current += 1;

      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 2500);

      const requiredClicks = panicConfig.click_count || 5;
      if (clickCountRef.current >= requiredClicks) {
        clickCountRef.current = 0;
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

        if (panicConfig.require_quick_pin && panicConfig.panic_pin) {
          setShowPinPrompt(true);
          setEnteredPin('');
          setPinError(false);
        } else {
          executePurge('MULTI_CLICK_GESTURE');
        }
      }
    };

    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('click', handleClick, true);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, [panicConfig, executePurge]);

  const handlePinSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (enteredPin === panicConfig.panic_pin) {
      executePurge('PIN_CONFIRMED');
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  };

  return {
    panicConfig,
    showPinPrompt,
    setShowPinPrompt,
    enteredPin,
    setEnteredPin,
    pinError,
    handlePinSubmit,
    isPurging,
    executePurge,
  };
}
