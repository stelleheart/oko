import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { base64ToBuffer, decryptData } from "@/backend/accounts/crypto";

export function useDecryptedDeviceName(
  encrypted: string | undefined,
  seed: string | undefined,
): string {
  const { t } = useTranslation();
  const fallback = t("settings.account.devices.unknownDevice");
  const [name, setName] = useState<string>(fallback);

  useEffect(() => {
    if (!encrypted || !seed) {
      setName(fallback);
      return;
    }
    const parts = encrypted.split(".");
    if (parts.length !== 3) {
      // Legacy plaintext device name (stored before encryption was added)
      setName(encrypted || fallback);
      return;
    }
    let cancelled = false;
    decryptData(encrypted, base64ToBuffer(seed))
      .then((decrypted) => {
        if (!cancelled) setName(decrypted);
      })
      .catch((error) => {
        console.warn("Failed to decrypt device name:", error);
        if (!cancelled) setName(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [encrypted, seed, fallback]);

  return name;
}
