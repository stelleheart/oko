import { create } from "zustand";
import { persist, PersistStorage, StorageValue } from "zustand/middleware";

/**
 * notificationsPrefs
 *
 * Consolidation of the per-user notification preferences that previously
 * lived as raw localStorage calls in NotificationModal.tsx, the
 * notificationsModal utils, and useNotifications.ts.
 *
 * Storage keys (preserved exactly for backward compatibility):
 *  - `read-notifications`             (JSON-stringified string[])
 *  - `notification-auto-read-days`    (number, serialized as a bare string,
 *                                       e.g. "14" — NOT JSON-wrapped)
 *  - `notification-custom-feeds`      (JSON-stringified string[])
 *
 * The three keys have different on-disk shapes (one is a bare number string,
 * the other two are JSON arrays), so we use a multi-key custom storage
 * adapter that fans the merged store out to the three keys on write and
 * merges them back on read.
 */

const READ_KEY = "read-notifications";
const AUTO_READ_DAYS_KEY = "notification-auto-read-days";
const CUSTOM_FEEDS_KEY = "notification-custom-feeds";

export interface NotificationsPrefsState {
  readNotifications: string[];
  autoReadDays: number;
  customFeeds: string[];

  setReadNotifications: (next: string[]) => void;
  addReadNotification: (guid: string) => void;
  removeReadNotification: (guid: string) => void;
  clearReadNotifications: () => void;

  setAutoReadDays: (days: number) => void;

  setCustomFeeds: (feeds: string[]) => void;
}

type NotificationsPrefsPersisted = Pick<
  NotificationsPrefsState,
  "readNotifications" | "autoReadDays" | "customFeeds"
>;

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLegacyString(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseRead(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

function parseAutoReadDays(raw: string | null): number {
  if (!raw) return 14;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 14;
  return n;
}

function parseCustomFeeds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

const multiKeyStorage: PersistStorage<NotificationsPrefsPersisted> = {
  getItem: (_name: string): StorageValue<NotificationsPrefsPersisted> | null => {
    if (!isBrowser()) return null;
    const merged: NotificationsPrefsPersisted = {
      readNotifications: parseRead(readLegacyString(READ_KEY)),
      autoReadDays: parseAutoReadDays(readLegacyString(AUTO_READ_DAYS_KEY)),
      customFeeds: parseCustomFeeds(readLegacyString(CUSTOM_FEEDS_KEY)),
    };
    return merged as unknown as StorageValue<NotificationsPrefsPersisted>;
  },
  setItem: (
    _name: string,
    value: StorageValue<NotificationsPrefsPersisted>,
  ): void => {
    if (!isBrowser()) return;
    const v = (value ?? {}) as Partial<NotificationsPrefsPersisted>;
    // Preserve the exact legacy encodings:
    //  - readNotifications  → JSON array string
    //  - autoReadDays       → bare number-as-string (NOT JSON)
    //  - customFeeds        → JSON array string
    window.localStorage.setItem(
      READ_KEY,
      JSON.stringify(v.readNotifications ?? []),
    );
    window.localStorage.setItem(
      AUTO_READ_DAYS_KEY,
      String(v.autoReadDays ?? 14),
    );
    window.localStorage.setItem(
      CUSTOM_FEEDS_KEY,
      JSON.stringify(v.customFeeds ?? []),
    );
  },
  removeItem: (_name: string): void => {
    if (!isBrowser()) return;
    window.localStorage.removeItem(READ_KEY);
    window.localStorage.removeItem(AUTO_READ_DAYS_KEY);
    window.localStorage.removeItem(CUSTOM_FEEDS_KEY);
  },
};

export const useNotificationsPrefsStore = create<NotificationsPrefsState>()(
  persist(
    (set) => ({
      readNotifications: [],
      autoReadDays: 14,
      customFeeds: [],

      setReadNotifications: (next) => set({ readNotifications: [...next] }),

      addReadNotification: (guid) =>
        set((s) => {
          if (s.readNotifications.includes(guid)) return s;
          return { readNotifications: [...s.readNotifications, guid] };
        }),

      removeReadNotification: (guid) =>
        set((s) => ({
          readNotifications: s.readNotifications.filter((g) => g !== guid),
        })),

      clearReadNotifications: () => set({ readNotifications: [] }),

      setAutoReadDays: (days) =>
        set({
          autoReadDays:
            Number.isFinite(days) && days > 0 ? Math.floor(days) : 14,
        }),

      setCustomFeeds: (feeds) => set({ customFeeds: [...feeds] }),
    }),
    {
      name: READ_KEY,
      storage: multiKeyStorage,
      partialize: (s) => ({
        readNotifications: s.readNotifications,
        autoReadDays: s.autoReadDays,
        customFeeds: s.customFeeds,
      }),
      // No legacy → new key rename needed: the keys we read are the same keys
      // we write, so existing data on disk is consumed directly.
    },
  ),
);

/**
 * Read the current custom-feeds list from outside of React (e.g. from a
 * utility function that doesn't have access to hooks). Always reflects the
 * latest persisted state.
 */
export function getCustomFeeds(): string[] {
  return useNotificationsPrefsStore.getState().customFeeds;
}

/**
 * Read the current read-notifications list from outside of React. Always
 * reflects the latest persisted state.
 */
export function getReadNotifications(): string[] {
  return useNotificationsPrefsStore.getState().readNotifications;
}
