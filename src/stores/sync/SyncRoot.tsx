/**
 * Generic sync layer — collapses what used to be 5 separate Syncer components
 * (BookmarkSyncer, ProgressSyncer, WatchHistorySyncer, GroupSyncer,
 * SettingsSyncer) into a single declarative root.
 *
 * Two task shapes are supported:
 *   1. `interval`   — drain a queue / poll for diffs on a fixed interval
 *   2. `subscribe`  — passive listener (not used in this initial cut; reserved
 *                     for future event-driven sync)
 *
 * Tasks are declared in `tasks.ts` and registered in this file via the
 * `taskFactories` array. Each task factory returns a `SyncTask` with internal
 * closure state (e.g. GroupSyncer's lastSyncedOrder), so each factory is
 * called exactly once when <SyncRoot /> mounts.
 *
 * NOTE: the Trakt syncers (TraktBookmarkSyncer, TraktHistorySyncer) and
 * TraktScrobbler stay as separate components because they have:
 *   - retry-on-failure semantics (TraktBookmarkSyncer's retryTrigger),
 *   - hydrate-after-persist coordination (waiting for useTraktAuthStore.persist
 *     to finish before the first fullSync),
 *   - non-queue behaviors (TraktScrobbler subscribes to player state changes,
 *     uses window.pagehide, runs a 10s keep-alive interval).
 * Folding those into a generic scheduler would require more state than the
 * simple ones — not worth the abstraction. Phase 3 step B = 5 → 1 here;
 * the Trakt trio stays explicit.
 */
import { useEffect, useMemo } from "react";

import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useGroupOrderStore } from "@/stores/groupOrder";
import { useProgressStore } from "@/stores/progress";
import { useSubtitleStore } from "@/stores/subtitles";
import { useWatchHistoryStore } from "@/stores/watchHistory";

import { addBookmark, removeBookmark } from "@/backend/accounts/bookmarks";
import { updateGroupOrder } from "@/backend/accounts/groupOrder";
import {
  progressUpdateItemToInput,
  removeProgress,
  setProgress,
} from "@/backend/accounts/progress";
import { updateSettings } from "@/backend/accounts/settings";
import {
  removeWatchHistory,
  setWatchHistory,
  watchHistoryUpdateItemToInput,
} from "@/backend/accounts/watchHistory";

// ---------------------------------------------------------------------------
// task types
// ---------------------------------------------------------------------------

export type SyncContext = {
  url: string | null;
  account: AccountWithToken | null;
};

export interface IntervalTask {
  kind: "interval";
  /** ms between drains; defaults to 5000 */
  intervalMs?: number;
  /** called once on mount (e.g. clear any persisted queue) */
  onBoot?: () => void;
  /** the actual drain — receives the context every tick */
  drain: (ctx: SyncContext) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// bookmark drain (was BookmarkSyncer)
// ---------------------------------------------------------------------------

async function drainBookmarks(ctx: SyncContext) {
  const { url, account } = ctx;
  if (!url) return;
  const store = useBookmarkStore.getState();
  const items = store.updateQueue;
  if (items.length === 0) return;
  for (const item of items) {
    // complete it beforehand so it doesn't get handled while in progress
    store.removeUpdateItem(item.id);
    if (!account) continue;
    try {
      if (item.action === "delete") {
        await removeBookmark(url, account, item.tmdbId);
        continue;
      }
      if (item.action === "add") {
        await addBookmark(url, account, {
          meta: {
            poster: item.poster,
            title: item.title ?? "",
            type: item.type ?? "",
            year: item.year ?? NaN,
          },
          tmdbId: item.tmdbId,
          group: item.group,
          favoriteEpisodes: item.favoriteEpisodes,
        });
      }
    } catch (err) {
      console.error(
        `Failed to sync bookmark: ${item.tmdbId} - ${item.action}`,
        err,
      );
    }
  }
}

function bookmarkTask(): IntervalTask {
  return {
    kind: "interval",
    intervalMs: 5_000,
    onBoot: () => useBookmarkStore.getState().clearUpdateQueue(),
    drain: drainBookmarks,
  };
}

// ---------------------------------------------------------------------------
// progress drain (was ProgressSyncer)
// ---------------------------------------------------------------------------

async function drainProgress(ctx: SyncContext) {
  const { url, account } = ctx;
  if (!url) return;
  const store = useProgressStore.getState();
  const items = store.updateQueue;
  if (items.length === 0) return;
  for (const item of items) {
    store.removeUpdateItem(item.id);
    if (!account) continue;
    try {
      if (item.action === "delete") {
        await removeProgress(
          url,
          account,
          item.tmdbId,
          item.seasonId,
          item.episodeId,
        );
        continue;
      }
      if (item.action === "upsert") {
        await setProgress(url, account, progressUpdateItemToInput(item));
      }
    } catch (err) {
      console.error(
        `Failed to sync progress: ${item.tmdbId} - ${item.action}`,
        err,
      );
    }
  }
}

function progressTask(): IntervalTask {
  return {
    kind: "interval",
    intervalMs: 20_000,
    onBoot: () => useProgressStore.getState().clearUpdateQueue(),
    drain: drainProgress,
  };
}

// ---------------------------------------------------------------------------
// watch history drain (was WatchHistorySyncer)
// ---------------------------------------------------------------------------

async function drainWatchHistory(ctx: SyncContext) {
  const { url, account } = ctx;
  if (!url) return;
  const store = useWatchHistoryStore.getState();
  const items = store.updateQueue;
  if (items.length === 0) return;
  for (const item of items) {
    store.removeUpdateItem(item.id);
    if (!account) continue;
    try {
      if (item.action === "delete") {
        await removeWatchHistory(
          url,
          account,
          item.tmdbId,
          item.episodeId,
          item.seasonId,
        );
        continue;
      }
      if (item.action === "add" || item.action === "update") {
        await setWatchHistory(
          url,
          account,
          watchHistoryUpdateItemToInput(item),
        );
      }
    } catch (err) {
      console.error(
        `Failed to sync watch history: ${item.tmdbId} - ${item.action}`,
        err,
      );
    }
  }
}

function watchHistoryTask(): IntervalTask {
  return {
    kind: "interval",
    intervalMs: 60_000,
    onBoot: () => useWatchHistoryStore.getState().clearUpdateQueue(),
    drain: drainWatchHistory,
  };
}

// ---------------------------------------------------------------------------
// group order poll (was GroupSyncer)
// ---------------------------------------------------------------------------

function groupOrderTask(): IntervalTask {
  let lastSyncedOrder: string[] = [];
  let initialized = false;
  return {
    kind: "interval",
    intervalMs: 5_000,
    drain: async (ctx) => {
      const { url, account } = ctx;
      if (!url || !account) return;
      const currentOrder = useGroupOrderStore.getState().groupOrder;
      if (!initialized) {
        lastSyncedOrder = [...currentOrder];
        initialized = true;
        return;
      }
      const hasChanged =
        JSON.stringify(currentOrder) !== JSON.stringify(lastSyncedOrder);
      if (!hasChanged) return;
      try {
        await updateGroupOrder(url, account, currentOrder);
        lastSyncedOrder = [...currentOrder];
      } catch (err) {
        console.error("Failed to sync group order:", err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// subtitle settings poll (was SettingsSyncer)
// ---------------------------------------------------------------------------

function subtitleSettingsTask(): IntervalTask {
  return {
    kind: "interval",
    intervalMs: 5_000,
    drain: async (ctx) => {
      const { url, account } = ctx;
      if (!url) return;
      const state = useSubtitleStore.getState();
      if (state.lastSync.lastSelectedLanguage === state.lastSelectedLanguage) {
        return;
      }
      if (!account || !state.lastSelectedLanguage) return;
      try {
        await updateSettings(url, account, {
          defaultSubtitleLanguage: state.lastSelectedLanguage,
        });
        state.importSubtitleLanguage(state.lastSelectedLanguage);
      } catch (err) {
        console.error("Failed to sync subtitle settings:", err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// task registry
// ---------------------------------------------------------------------------

const taskFactories: (() => IntervalTask)[] = [
  bookmarkTask,
  progressTask,
  watchHistoryTask,
  groupOrderTask,
  subtitleSettingsTask,
];

// ---------------------------------------------------------------------------
// root component
// ---------------------------------------------------------------------------

export function SyncRoot() {
  const url = useBackendUrl();
  const account = useAuthStore((s) => s.account);

  // build tasks once per mount of <SyncRoot />
  // (each factory returns a task with internal state; never re-create)
  const tasks = useMemo(() => taskFactories.map((f) => f()), []);

  useEffect(() => {
    const ctx: SyncContext = { url, account };

    // boot hooks (clear persisted queues)
    for (const task of tasks) {
      task.onBoot?.();
    }

    const cleanups: Array<() => void> = [];

    for (const task of tasks) {
      const intervalMs = task.intervalMs ?? 5_000;
      const tick = () => {
        void task.drain(ctx);
      };
      // run once immediately, then on interval
      tick();
      const id = setInterval(tick, intervalMs);
      cleanups.push(() => clearInterval(id));
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [url, account, tasks]);

  return null;
}
