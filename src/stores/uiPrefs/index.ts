import { create } from "zustand";
import { persist, PersistStorage, StorageValue } from "zustand/middleware";

/**
 * uiPrefs
 *
 * Consolidation of UI-level preferences that previously lived as raw
 * localStorage calls scattered across the app.
 *
 * Storage keys (preserved exactly for backward compatibility):
 *  - `m3u8-proxy-enabled`              (Record<proxyIdString, boolean>)
 *  - `__MW::bannerDismissals`          (Record<bannerId, true>) — new unified key
 *      - migrates any pre-existing `hideBanner-${id}` = "true" keys on first load
 *  - `__MW::modalDismissals`           (Record<modalId, true>) — new unified key
 *      - migrates any pre-existing `modal-${id}-dismissed` = "true" keys on first load
 *
 * The m3u8 key matches the original name + on-disk shape exactly (a
 * JSON-stringified Record keyed by proxy index, where `true`/`false` denotes
 * enabled state and absence-of-key means "enabled"). Both the admin toggle
 * (M3U8TestPart) and the runtime fetcher (fetchers.ts) read/write the same
 * shape.
 */

const M3U8_KEY = "m3u8-proxy-enabled";
const BANNER_KEY = "__MW::bannerDismissals";
const MODAL_KEY = "__MW::modalDismissals";

const LEGACY_BANNER_PREFIX = "hideBanner-";
const LEGACY_MODAL_SUFFIX = "-dismissed";

export interface UiPrefsState {
  // Map of proxy index (string) → enabled boolean. Absent entry = enabled
  // (mirrors the legacy on-disk semantics so the fetcher can keep treating
  // missing keys as truthy).
  m3u8ProxyEnabled: Record<string, boolean>;

  // Map of banner id → true. A banner id appears here iff the user dismissed
  // it and should not be shown again.
  bannerDismissals: Record<string, true>;

  // Map of modal id → true. A modal id appears here iff the user closed the
  // one-time modal and it should not be re-opened.
  modalDismissals: Record<string, true>;

  setM3U8ProxyEnabled: (next: Record<string, boolean>) => void;
  setM3U8ProxyForProxy: (id: string, enabled: boolean) => void;
  isM3U8ProxyEnabled: (id: string) => boolean;

  dismissBanner: (id: string) => void;
  isBannerDismissed: (id: string) => boolean;

  dismissModal: (id: string) => void;
  isModalDismissed: (id: string) => boolean;
}

type UiPrefsPersisted = Pick<
  UiPrefsState,
  "m3u8ProxyEnabled" | "bannerDismissals" | "modalDismissals"
>;

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function migrateLegacyBannerDismissals(): Record<string, true> {
  if (!isBrowser()) return {};
  const out: Record<string, true> = {};
  const ls = window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key || !key.startsWith(LEGACY_BANNER_PREFIX)) continue;
    // Only treat keys whose value is "true" as a real dismissal; this matches
    // the original BannerLocation semantics (`if (hideBannerFlag) hideBanner(...)`).
    if (ls.getItem(key) === "true") {
      out[key.slice(LEGACY_BANNER_PREFIX.length)] = true;
    }
    // Always remove the legacy key — even if it was a stray non-"true" value —
    // so we don't pollute future migrations.
    ls.removeItem(key);
  }
  return out;
}

function migrateLegacyModalDismissals(): Record<string, true> {
  if (!isBrowser()) return {};
  const out: Record<string, true> = {};
  const ls = window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (!key || !key.endsWith(LEGACY_MODAL_SUFFIX)) continue;
    // Skip the new unified key — it shouldn't end with "-dismissed" but guard
    // anyway.
    if (key === MODAL_KEY) continue;
    if (ls.getItem(key) === "true") {
      out[key.slice(0, -LEGACY_MODAL_SUFFIX.length)] = true;
    }
    ls.removeItem(key);
  }
  return out;
}

function readLegacyKey<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return (parsed as { state: T }).state ?? fallback;
    }
    // Some legacy writers may have stored the bare value (no zustand wrapper).
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Custom storage adapter that fans a single zustand store across three
 * independent localStorage keys (preserving the original on-disk shape per
 * slice). When zustand persist writes the merged store, this splits it back
 * out to the three keys; when it reads, this merges the three keys into the
 * shape the store expects.
 */
const multiKeyStorage: PersistStorage<UiPrefsPersisted> = {
  getItem: (_name: string): StorageValue<UiPrefsPersisted> | null => {
    if (!isBrowser()) return null;
    const merged: UiPrefsPersisted = {
      m3u8ProxyEnabled: readLegacyKey<Record<string, boolean>>(M3U8_KEY, {}),
      bannerDismissals: readLegacyKey<Record<string, true>>(BANNER_KEY, {}),
      modalDismissals: readLegacyKey<Record<string, true>>(MODAL_KEY, {}),
    };
    return merged as unknown as StorageValue<UiPrefsPersisted>;
  },
  setItem: (_name: string, value: StorageValue<UiPrefsPersisted>): void => {
    if (!isBrowser()) return;
    const v = (value ?? {}) as Partial<UiPrefsPersisted>;
    window.localStorage.setItem(
      M3U8_KEY,
      JSON.stringify({
        state: { m3u8ProxyEnabled: v.m3u8ProxyEnabled ?? {} },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      BANNER_KEY,
      JSON.stringify({
        state: { bannerDismissals: v.bannerDismissals ?? {} },
        version: 0,
      }),
    );
    window.localStorage.setItem(
      MODAL_KEY,
      JSON.stringify({
        state: { modalDismissals: v.modalDismissals ?? {} },
        version: 0,
      }),
    );
  },
  removeItem: (_name: string): void => {
    if (!isBrowser()) return;
    window.localStorage.removeItem(M3U8_KEY);
    window.localStorage.removeItem(BANNER_KEY);
    window.localStorage.removeItem(MODAL_KEY);
  },
};

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set, get) => ({
      m3u8ProxyEnabled: {},
      bannerDismissals: {},
      modalDismissals: {},

      setM3U8ProxyEnabled: (next) => set({ m3u8ProxyEnabled: next }),

      setM3U8ProxyForProxy: (id, enabled) =>
        set((s) => ({
          m3u8ProxyEnabled: { ...s.m3u8ProxyEnabled, [id]: enabled },
        })),

      // Mirrors the original fetchers.ts logic: `enabled[index] !== false`.
      // If the proxy id isn't recorded at all, treat it as enabled.
      isM3U8ProxyEnabled: (id) => get().m3u8ProxyEnabled[id] !== false,

      dismissBanner: (id) =>
        set((s) => ({
          bannerDismissals: { ...s.bannerDismissals, [id]: true },
        })),

      isBannerDismissed: (id) => Boolean(get().bannerDismissals[id]),

      dismissModal: (id) =>
        set((s) => ({
          modalDismissals: { ...s.modalDismissals, [id]: true },
        })),

      isModalDismissed: (id) => Boolean(get().modalDismissals[id]),
    }),
    {
      // The "name" passed to the custom storage is not used by it (we fan
      // out to three keys), but zustand requires one. Use the m3u8 key since
      // it has the most semantic meaning for the runtime.
      name: M3U8_KEY,
      storage: multiKeyStorage,
      // First-load migration: scan for legacy `hideBanner-*` and
      // `modal-*-dismissed` keys, fold them into the new unified maps, and
      // delete the legacy keys. This runs once per browser because the legacy
      // keys are removed as part of the migration.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const legacyBanners = migrateLegacyBannerDismissals();
        const legacyModals = migrateLegacyModalDismissals();
        if (
          Object.keys(legacyBanners).length > 0 ||
          Object.keys(legacyModals).length > 0
        ) {
          // Use setState to merge — this triggers another persist write so the
          // unified keys get written on disk. Because the legacy keys are
          // already deleted above, a future rehydrate will see no legacy data.
          useUiPrefsStore.setState({
            bannerDismissals: {
              ...state.bannerDismissals,
              ...legacyBanners,
            },
            modalDismissals: {
              ...state.modalDismissals,
              ...legacyModals,
            },
          });
        }
      },
      // Only persist the three data slices; the action functions are not
      // serializable and don't need to survive a refresh.
      partialize: (s) => ({
        m3u8ProxyEnabled: s.m3u8ProxyEnabled,
        bannerDismissals: s.bannerDismissals,
        modalDismissals: s.modalDismissals,
      }),
    },
  ),
);
