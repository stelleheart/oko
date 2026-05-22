/**
 * Clears the service worker precache and forces a hard reload.
 *
 * Used when CF Access (or similar auth-gate) expires — the app may be
 * running from SW precache, so we need to delete it before reloading so
 * the auth gate can intercept the request.
 *
 * @returns never (page navigates or throws)
 */
export async function clearPrecacheAndReload(): Promise<never> {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("workbox-precache"))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // If caches.keys() fails (e.g., cross-origin denial), proceed with reload anyway
  }
  // Hard reload bypasses SW cache and forces fresh fetch from network
  window.location.reload(true);
  throw new Error("unreachable");
}