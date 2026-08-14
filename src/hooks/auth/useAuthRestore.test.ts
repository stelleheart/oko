import { describe, expect, it } from "vitest";

import { shouldStartOidcLogin } from "@/hooks/auth/useAuthRestore";

describe("shouldStartOidcLogin", () => {
	it("starts only when no account exists and the oidc callback is not being completed", () => {
		expect(shouldStartOidcLogin(false, "/")).toBe(true);
		expect(shouldStartOidcLogin(true, "/")).toBe(false);
		expect(shouldStartOidcLogin(false, "/auth/callback")).toBe(false);
		expect(shouldStartOidcLogin(false, "/#/auth/callback?code=bootstrap")).toBe(
			false,
		);
	});

	it("starts for deep routes when unauthenticated", () => {
		expect(shouldStartOidcLogin(false, "/browse?q=hello")).toBe(true);
		expect(shouldStartOidcLogin(false, "/movie/550")).toBe(true);
		expect(shouldStartOidcLogin(true, "/movie/550")).toBe(false);
	});

	it("does not trigger when the callback path appears mid-route but still short-circuits", () => {
		// The callback guard uses a substring match, so any location containing
		// "/auth/callback" suppresses the login redirect regardless of account.
		expect(shouldStartOidcLogin(false, "/dashboard#/auth/callback")).toBe(
			false,
		);
	});

	it("still suppresses login when authenticated, even on the callback path", () => {
		expect(shouldStartOidcLogin(true, "/auth/callback")).toBe(false);
	});

	it("starts when only a query string is present on the root", () => {
		expect(shouldStartOidcLogin(false, "/?redirect=/watch")).toBe(true);
	});
});
