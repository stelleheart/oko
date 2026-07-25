import { useRef } from "react";
import { useAsync, useInterval } from "react-use";

import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthStore } from "@/stores/auth";

const AUTH_CHECK_INTERVAL = 12 * 60 * 60 * 1000;
const OIDC_CALLBACK_PATH = "/auth/callback";

export function shouldStartOidcLogin(
	loggedIn: boolean,
	location: string,
): boolean {
	return !loggedIn && !location.includes(OIDC_CALLBACK_PATH);
}

export function useAuthRestore() {
	const { account } = useAuthStore();
	const { loginWithOidc, restore } = useAuth();
	const hasRestored = useRef(false);

	useInterval(() => {
		if (account) restore(account);
	}, AUTH_CHECK_INTERVAL);

	const result = useAsync(async () => {
		if (hasRestored.current) return;
		if (!account) {
			if (
				shouldStartOidcLogin(
					false,
					`${window.location.pathname}${window.location.hash}`,
				)
			) {
				await loginWithOidc(navigator.userAgent);
			}
			return;
		}
		await restore(account).finally(() => {
			hasRestored.current = true;
		});
	}, [account]); // re-run when account changes so fresh OIDC logins restore prefs

	return result;
}
