import { useCallback } from "react";

import { SessionResponse } from "@/backend/accounts/auth";
import {
  bootstrapOidcSession,
  getIdpLogoutUrl,
  startOidcLogin,
} from "@/backend/accounts/oidc";
import { removeSession } from "@/backend/accounts/sessions";
import { getSettings } from "@/backend/accounts/settings";
import {
  UserResponse,
  getBookmarks,
  getProgress,
  getUser,
  getWatchHistory,
} from "@/backend/accounts/user";
import { getGroupOrder } from "@/backend/accounts/groupOrder";
import { importBookmarks, importProgress } from "@/backend/accounts/import";
import { progressMediaItemToInputs } from "@/backend/accounts/progress";
import { bookmarkMediaToInput } from "@/backend/accounts/bookmarks";
import { useAuthData } from "@/hooks/auth/useAuthData";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { BookmarkMediaItem } from "@/stores/bookmarks";
import { ProgressMediaItem } from "@/stores/progress";

export function useAuth() {
  const currentAccount = useAuthStore((s) => s.account);
  const profile = useAuthStore((s) => s.account?.profile);
  const loggedIn = !!useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();
  const {
    logout: userDataLogout,
    login: userDataLogin,
    syncData,
  } = useAuthData();

  const loginWithOidc = useCallback(
    async (device: string) => {
      if (!backendUrl) return;

      const { url } = await startOidcLogin(backendUrl, device);
      window.location.href = url;
    },
    [backendUrl],
  );

  const completeOidcLogin = useCallback(
    async (code: string) => {
      if (!backendUrl) return null;

      const loginResult = await bootstrapOidcSession(backendUrl, code);
      return userDataLogin(loginResult, loginResult.user, loginResult.session);
    },
    [backendUrl, userDataLogin],
  );

  const logout = useCallback(async () => {
    if (!currentAccount || !backendUrl) return;
    try {
      await removeSession(
        backendUrl,
        currentAccount.token,
        currentAccount.sessionId,
      );
    } catch {
      // we dont care about failing to delete session
    }
    await userDataLogout();
    // End the IdP session too. If this fails (e.g. offline) the local logout
    // already succeeded; just don't redirect.
    try {
      const idpLogoutUrl = await getIdpLogoutUrl(backendUrl);
      window.location.href = idpLogoutUrl;
    } catch {
      // no-op: local logout already completed
    }
  }, [userDataLogout, backendUrl, currentAccount]);

  const disconnectFromBackend = useCallback(async () => {
    if (!currentAccount || !backendUrl) return;
    try {
      await removeSession(
        backendUrl,
        currentAccount.token,
        currentAccount.sessionId,
      );
    } catch {
      // we dont care about failing to delete session
    }
    // Only remove the account, keep all local data
    useAuthStore.getState().removeAccount();
  }, [backendUrl, currentAccount]);

  const importData = useCallback(
    async (
      account: AccountWithToken,
      progressItems: Record<string, ProgressMediaItem>,
      bookmarks: Record<string, BookmarkMediaItem>,
    ) => {
      if (!backendUrl) return;
      if (
        Object.keys(progressItems).length === 0 &&
        Object.keys(bookmarks).length === 0
      ) {
        return;
      }

      const progressInputs = Object.entries(progressItems).flatMap(
        ([tmdbId, item]) => progressMediaItemToInputs(tmdbId, item),
      );

      const bookmarkInputs = Object.entries(bookmarks).map(([tmdbId, item]) =>
        bookmarkMediaToInput(tmdbId, item),
      );

      await Promise.all([
        importProgress(backendUrl, account, progressInputs),
        importBookmarks(backendUrl, account, bookmarkInputs),
      ]);
    },
    [backendUrl],
  );

  const restore = useCallback(
    async (account: AccountWithToken) => {
      if (!backendUrl) return;
      let user: { user: UserResponse; session: SessionResponse };
      try {
        user = await getUser(backendUrl, account.token);
      } catch (err) {
        // Backend error — clear SW precache to ensure we're not running a stale cached version
        const { clearPrecacheAndReload } = await import("@/utils/cacheControl");
        await clearPrecacheAndReload();
        return; // never reached
      }

      const [bookmarks, progress, watchHistory, settings, groupOrder] =
        await Promise.all([
          getBookmarks(backendUrl, account),
          getProgress(backendUrl, account),
          getWatchHistory(backendUrl, account),
          getSettings(backendUrl, account),
          getGroupOrder(backendUrl, account),
        ]);

      // Update account store with fresh user data (including nickname)
      const { setAccount } = useAuthStore.getState();
      if (account) {
        setAccount({
          ...account,
          nickname: user.user.nickname,
          profile: user.user.profile,
        });
      }

      syncData(
        user.user,
        user.session,
        progress,
        bookmarks,
        watchHistory,
        settings,
        groupOrder,
      );
    },
    [backendUrl, syncData, logout],
  );

  return {
    loggedIn,
    profile,
    loginWithOidc,
    completeOidcLogin,
    logout,
    disconnectFromBackend,
    restore,
    importData,
  };
}
