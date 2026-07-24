import { useCallback, useState } from "react";

function readFlag(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return defaultValue;
  }
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return defaultValue;
  }
}

/**
 * useLocalFlag(key, default)
 *
 * Tiny persistent boolean flag stored under a single localStorage key.
 * Intended for one-off dismissals and "seen this" markers that don't justify
 * a full zustand store.
 *
 * Backward-compatible: the value on disk is the literal string "true" when
 * set, matching the legacy call sites in src/components/overlays/Modal.tsx
 * and src/pages/parts/home/RevivalAnnouncementModal.tsx.
 *
 * The flag is read synchronously on first render via a lazy state initializer
 * — this preserves the original synchronous-read semantics of the legacy
 * call sites (e.g. "show the modal only if not previously dismissed").
 *
 * Returns:
 *  - `value`: the current boolean
 *  - `setTrue`: a stable callback that sets the flag to true
 *  - `setFalse`: a stable callback that removes the flag (sets to default)
 */
export function useLocalFlag(
  key: string,
  defaultValue = false,
): {
  value: boolean;
  setTrue: () => void;
  setFalse: () => void;
} {
  // Lazy initializer runs once per `key` change — keeps SSR safe and
  // preserves the synchronous-on-first-paint semantics of the original
  // `localStorage.getItem(...)` calls being replaced.
  const [value, setValue] = useState<boolean>(() =>
    readFlag(key, defaultValue),
  );

  const setTrue = useCallback(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(key, "true");
    } catch {
      // ignore quota / privacy-mode errors
    }
    setValue(true);
  }, [key]);

  const setFalse = useCallback(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValue(defaultValue);
  }, [key, defaultValue]);

  return { value, setTrue, setFalse };
}
