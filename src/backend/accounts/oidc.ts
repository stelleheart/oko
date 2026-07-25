import { ofetch } from "ofetch";

import type { LoginResponse } from "@/backend/accounts/auth";

export async function startOidcLogin(
	url: string,
	device: string,
): Promise<{ url: string }> {
	return ofetch<{ url: string }>("/auth/oidc/start", {
		method: "POST",
		body: { device },
		baseURL: url,
	});
}

export async function bootstrapOidcSession(
	url: string,
	code: string,
): Promise<LoginResponse> {
	return ofetch<LoginResponse>("/auth/oidc/bootstrap", {
		method: "POST",
		body: { code },
		baseURL: url,
	});
}

export async function getIdpLogoutUrl(url: string): Promise<string> {
	const { url: logoutUrl } = await ofetch<{ url: string }>(
		"/auth/oidc/logout",
		{
			method: "POST",
			baseURL: url,
		},
	);
	return logoutUrl;
}
