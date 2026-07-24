import { create } from "zustand";
import { persist, PersistStorage, StorageValue } from "zustand/middleware";

/**
 * homePrefs
 *
 * Per-page sort preferences for the Home page Bookmarks and Continue
 * Watching sections.
 *
 * Storage keys (preserved exactly for backward compatibility):
 *  - `__MW::bookmarksSort`  (bare sort-id string, e.g. "date")
 *  - `__MW::watchingSort`   (bare sort-id string, e.g. "date")
 *
 * The legacy writers called `localStorage.setItem(key, sortBy)` with the raw
 * string — not a JSON-wrapped value. The custom storage adapter preserves that
 * exact encoding.
 */

const BOOKMARKS_SORT_KEY = "__MW::bookmarksSort";
const WATCHING_SORT_KEY = "__MW::watchingSort";

export type SortId = string;

export interface HomePrefsState {
  bookmarksSort: SortId;
  watchingSort: SortId;

  setBookmarksSort: (next: SortId) => void;
  setWatchingSort: (next: SortId) => void;
}

type HomePrefsPersisted = Pick<HomePrefsState, "bookmarksSort" | "watchingSort">;

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLegacyString(key: string): SortId | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

const multiKeyStorage: PersistStorage<HomePrefsPersisted> = {
  getItem: (_name: string): StorageValue<HomePrefsPersisted> | null => {
    if (!isBrowser()) return null;
    const merged: HomePrefsPersisted = {
      bookmarksSort: readLegacyString(BOOKMARKS_SORT_KEY) ?? "date",
      watchingSort: readLegacyString(WATCHING_SORT_KEY) ?? "date",
    };
    return merged as unknown as StorageValue<HomePrefsPersisted>;
  },
  setItem: (
    _name: string,
    value: StorageValue<HomePrefsPersisted>,
  ): void => {
    if (!isBrowser()) return;
    const v = (value ?? {}) as Partial<HomePrefsPersisted>;
    // Preserve the exact legacy encoding: bare strings, NOT JSON-wrapped.
    window.localStorage.setItem(
      BOOKMARKS_SORT_KEY,
      String(v.bookmarksSort ?? "date"),
    );
    window.localStorage.setItem(
      WATCHING_SORT_KEY,
      String(v.watchingSort ?? "date"),
    );
  },
  removeItem: (_name: string): void => {
    if (!isBrowser()) return;
    window.localStorage.removeItem(BOOKMARKS_SORT_KEY);
    window.localStorage.removeItem(WATCHING_SORT_KEY);
  },
};

export const useHomePrefsStore = create<HomePrefsState>()(
  persist(
    (set) => ({
      bookmarksSort: "date",
      watchingSort: "date",

      setBookmarksSort: (next) => set({ bookmarksSort: next }),
      setWatchingSort: (next) => set({ watchingSort: next }),
    }),
    {
      name: BOOKMARKS_SORT_KEY,
      storage: multiKeyStorage,
      partialize: (s) => ({
        bookmarksSort: s.bookmarksSort,
        watchingSort: s.watchingSort,
      }),
    },
  ),
);
