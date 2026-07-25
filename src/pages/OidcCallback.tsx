import { useNavigate, useSearchParams } from "react-router-dom";
import { useAsync } from "react-use";

import { LargeCard, LargeCardText } from "@/components/layout/LargeCard";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";

export function OidcCallbackPage() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const backendUrl = useBackendUrl();
	const { completeOidcLogin } = useAuth();

	const result = useAsync(async () => {
		const code = params.get("code");
		if (!code) {
			throw new Error("Missing authorization code");
		}
		if (!backendUrl) {
			throw new Error("No backend URL configured");
		}

		const account = await completeOidcLogin(code);
		if (!account) {
			throw new Error("OIDC login failed");
		}

		navigate("/", { replace: true });
	}, [params, backendUrl, completeOidcLogin, navigate]);

	if (result.loading) {
		return (
			<LargeCard>
				<LargeCardText title="Signing you in…" />
			</LargeCard>
		);
	}

	if (result.error) {
		return (
			<LargeCard>
				<LargeCardText title="Login failed">
					{result.error?.message}
				</LargeCardText>
			</LargeCard>
		);
	}

	return null;
}
