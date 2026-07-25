import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import {
	LargeCard,
	LargeCardButtons,
	LargeCardText,
} from "@/components/layout/LargeCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";

export function OidcLoginPart() {
	const [device, setDevice] = useState("");
	const backendUrl = useBackendUrl();
	const { loginWithOidc } = useAuth();
	const { t } = useTranslation();

	const [result, execute] = useAsyncFn(
		async (inputDevice: string) => {
			if (!backendUrl) {
				throw new Error(t("auth.login.noBackendUrl") ?? "No backend URL");
			}

			const validatedDevice = inputDevice.trim();
			if (validatedDevice.length === 0)
				throw new Error(t("auth.login.deviceLengthError") ?? undefined);

			await loginWithOidc(validatedDevice);
			// loginWithOidc redirects the browser to the IdP — the OidcCallback
			// page picks up the bootstrap code and completes the session.
		},
		[loginWithOidc, backendUrl, t],
	);

	return (
		<LargeCard>
			<LargeCardText title={t("auth.oidc.signIn")}>
				<Trans i18nKey="auth.oidc.description" />
			</LargeCardText>
			<div className="space-y-4">
				<AuthInputBox
					label={t("auth.deviceNameLabel") ?? undefined}
					value={device}
					onChange={setDevice}
					placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
				/>
				{result.error && !result.loading ? (
					<p className="text-authentication-errorText">
						{result.error?.message}
					</p>
				) : null}
			</div>

			<LargeCardButtons>
				<Button
					theme="purple"
					loading={result.loading}
					onClick={() => execute(device)}
					disabled={result.loading || device.trim().length === 0}
				>
					<Icon icon={Icons.LOCK} className="mr-2" />
					{t("auth.oidc.signIn")}
				</Button>
			</LargeCardButtons>
		</LargeCard>
	);
}
