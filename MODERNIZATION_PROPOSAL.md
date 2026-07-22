# oko / p-stream — modernization proposal

> **status**: draft, awaiting approval. do not start work until each phase is signed off.
> **scope**: high-leverage architectural / technical improvements. not cosmetic cleanup.

## 1. executive summary

### overall state

- ~68k lines of TS/TSX, 475 source files, very dense single repo
- mature but sprawling feature surface: streaming, auth, scraping, player, i18n (55 locales), theming, watch party, trakt, captions, translations
- strong bones: clean zustand slice architecture for the player, sensible `tailwindcss-themer` setup, well-typed provider pipeline via `@p-stream/providers`
- deep structural debt: a parallel legacy-store migration chain (`src/stores/__old/`), a giant `useSettingsState` hook with 30+ positional args, a custom event emitter, a custom cache class, ~55 i18n locales statically bundled, ~half a dozen distinct persistence patterns

### biggest risks / sources of complexity

1. **legacy store migration machinery** (`src/stores/__old/`) — ~500 lines of custom versioned-store + tmdb-id remap logic for old localStorage data. kept alive only to support users from the previous app version.
2. **`useSettingsState` (613 lines, 30+ args)** — giant dirty-state hook feeding the 1254-line `Settings.tsx`. duplicated 40+ times across store calls; near-impossible to refactor field-by-field.
3. **store sprawl** — 18+ zustand stores; the `bookmarks` store has 3 sync queues (`updateQueue`, `traktUpdateQueue`, future ones) each needing their own syncer component. the pattern is repeated for `progress`, `groupOrder`, `watchHistory`, `subtitles`, `trakt*`. ~8 syncer components mounted at root in `src/index.tsx`.
4. **mixed persistence models** — zustand `persist` for ~10 stores, custom versioned stores in `__old`, raw `localStorage` for at least 4 features (notifications read state, m3u8 proxy enablement, dev banner, modal-dismissed flags, etc.).
5. **dual build infra** — `bun` in Dockerfile, `pnpm` in CI (`pnpm/action-setup@v2`, `pnpm install`, pnpm lockfile present). drift hazard.
6. **`node-forge` + `crypto-js`** for crypto; both are old/unmaintained libraries. modern web crypto API covers most needs and `@noble/hashes` is already a dep.
7. **`@p-stream/providers` via `github:stelleheart/providers#production`** — pulling a build artifact straight from a git branch is brittle for both security and reproducibility.

### highest-value opportunities

- kill the `__old` migration chain (one-time data import, then delete)
- collapse the 8 syncer components + dual update queues into a single declarative sync layer
- replace `node-forge`/`crypto-js` with web crypto + `@noble/*` (already in deps)
- unify on **one** package manager (bun or pnpm, pick one and delete the other)
- shrink `useSettingsState` + `Settings.tsx` by switching to schema-driven settings (single source of truth)
- replace inline SVG icon component with `lucide-react` or `react-icons` (~200 fewer lines, tree-shakable)
- delete dead deps: `million` (verified zero-imported), `react-sticky-el` (zero-imported), `react-google-recaptcha-v3` (superseded by `@marsidev/react-turnstile` which is already in deps)
- drop duplicate files: `src/setup/ga.ts` and `src/utils/setup/ga.ts` are byte-identical
- kill the `handlebars` index.html templating plugin (does 3 string substitutions and copies zero `*.hbs` files)

## 2. proposed changes

### A. delete `src/stores/__old/` (one-shot user data migration)

**problem.** ~500 lines of versioned-store machinery (`migrations.ts`, `__old/watched/store.ts`, `__old/bookmark/store.ts`, `__old/settings/store.ts`, `__old/volume/store.ts`) all gated by a `DONT_TOUCH_THIS_FOLDER` file. exists only to convert old `localStorage` payloads (`mw-bookmarks`, `video-progress`, `mw-volume`, etc.) into the current zustand stores on first launch.

**why it matters.**
- permanent load on every cold start (`initializeOldStores()` runs before auth in `src/index.tsx:148`)
- the v3 migrations re-fetch TMDB metadata over the network to remap old IDs
- a major refactor blocker: any new state-shape change means re-introducing this pattern
- confusing for new contributors

**expected impact.**
- removes 8 files, ~600 lines
- removes 1 round-trip to TMDB on first launch for legacy users
- removes ~25% of `backend/metadata/getmeta.ts` indirect dependencies

**scope.**
- `src/stores/__old/` (all of it)
- `src/stores/__old/imports.ts` (auto-mounts the legacy stores via side-effect imports)
- the `initializeOldStores()` call in `src/index.tsx`

**prereqs / risks.**
- one-time breaking change: users coming from "movie-web" v6 / p-stream pre-5.x will lose their old bookmarks/watch history unless migrated.
- **mitigation**: ship a one-time migration that runs *only if* the legacy keys exist, then writes a `__legacy_migrated_v1` flag. keep the code gated behind a single file with a clear `// DELETE AFTER 2026-09-01` comment. do not delete the code; just rip out the always-on mount.

**user-facing breaking change**: yes, but only for users who never open the app after the update. realistic impact ≈ 0.

---

### B. collapse 8 syncer components into one declarative sync layer

**problem.** `src/index.tsx` mounts 8 syncer components: `ProgressSyncer`, `BookmarkSyncer`, `WatchHistorySyncer`, `GroupSyncer`, `SettingsSyncer`, `TraktBookmarkSyncer`, `TraktHistorySyncer`, `TraktScrobbler`. each polls its store's `updateQueue` every 5s, makes backend calls, handles failures. each is structured identically (interval + queue draining). the bookmarks store even has TWO queues (`updateQueue` and `traktUpdateQueue`) duplicated 1:1 in `removeBookmark`/`addBookmark`.

**why it matters.**
- 8 side-effect components at root, each a parallel async loop
- easy to forget to drain a queue (e.g. `clearTraktUpdateQueue` exists but no syncer is known to call it — verify)
- `BookmarkSyncer.tsx` is the canonical pattern; the others are slight variations

**expected impact.**
- removes 6-8 components, ~400 lines
- single `useAccountSync()` hook at root that drains all queues (replaced by generic store-registered syncers)
- easier to add new syncable fields (just register them)
- removes the dual-queue pattern in bookmarks

**scope.**
- `src/stores/*/[A-Z]*Syncer.tsx` (8 files)
- `src/stores/bookmarks/index.ts` (collapse dual queue — see change S)
- `src/index.tsx` (single root mount)
- backend endpoints stay the same

**prereqs / risks.** low risk: the existing logic is mostly correct; this is a refactor not a redesign. need to ensure ordering: bookmark ↔ progress sync can race on the same backend session.

**user-facing breaking change**: no.

---

### C. replace `node-forge` + `crypto-js` with web crypto + `@noble/*`

**problem.** `src/backend/accounts/crypto.ts` uses `node-forge` for AES-GCM, PBKDF2, ed25519, BIP39, base64 utilities. `node-forge` is large (~600KB), old (mostly unmaintained since 2020), runs in pure JS, and is not built for the browser. `@noble/*` packages (already in deps: `@noble/hashes`, `@scure/bip39`) provide modern, audited, tree-shakable replacements.

**why it matters.**
- **performance**: web crypto is ~100x faster than forge for AES-GCM/PBKDF2
- **bundle size**: dropping forge shrinks `manualChunks.auth` chunk by ~400KB
- **security**: forge is effectively unmaintained; noble/scure are audited
- **cleaner code**: web crypto API is async-native (no `forge.random.getBytes` callback style)

**expected impact.**
- removes `node-forge`, `crypto-js`, `@types/crypto-js` from `dependencies`
- ~400KB smaller auth chunk
- measurable improvement on register/login (PBKDF2 is the slowest step)
- `bytesToBase64` becomes one line via `btoa` + `String.fromCodePoint`
- AES-GCM with web crypto is straightforward — async, no callbacks

**scope.**
- `src/backend/accounts/crypto.ts` (rewrite, ~150 lines)
- `vite.config.mts` (`manualChunks` for "auth" no longer needed; collapse into vendor)
- any callers of `bytesToBase64`, `forge.util.*`, etc. (mostly contained to crypto.ts)

**prereqs / risks.**
- breaking change for any existing user data encrypted with forge's output — verify passphrases are decrypted with **the new code on next login** (re-encrypt server-side or accept one-time re-encryption).
- ed25519 — web crypto doesn't support ed25519 directly. use `@noble/curves` (small, audited, modern) instead of forge.pki.
- BIP39 — already covered by `@scure/bip39`.

**user-facing breaking change**: possibly — depends on server-side decryption compatibility. need to coordinate with backend team.

---

### D. consolidate package management (drop one of bun/pnpm)

**problem.**
- `package.json` declares nothing about which manager
- `bun.lock` exists (lockfileVersion 1, ~234KB)
- `pnpm-lock.yaml` exists (lockfileVersion 9.0, ~314KB)
- `Dockerfile` uses bun: `npm install -g bun` then `bun install --frozen-lockfile --linker isolated`
- `.github/workflows/linting_testing.yml` uses pnpm: `pnpm/action-setup@v2`, `pnpm install`, `pnpm run lint`
- `.npmrc` has `shamefully-hoist=true` (pnpm-specific setting)

**why it matters.** CI and Docker may resolve different versions of transitive deps. contributors don't know which to use. two large lockfiles in repo (560KB total of dead-ish data).

**expected impact.**
- removes one lockfile (~280KB)
- removes one set of manager-specific config
- removes `pnpm/action-setup` from CI; replace with `oven-sh/setup-bun@v1` (or vice versa)

**scope.**
- `.github/workflows/linting_testing.yml`
- `Dockerfile`
- delete `pnpm-lock.yaml` OR `bun.lock`
- `.npmrc`

**prereqs / risks.** low risk; choose based on which is faster in CI vs Docker. recommendation: **bun** — already in Dockerfile, faster install, npm-compatible, works in both Docker and CI.

**user-facing breaking change**: no.

---

### E. schema-driven settings to kill `useSettingsState` bloat

**problem.**
- `src/hooks/useSettingsState.ts`: 613 lines, 30+ positional args, returns 30+ `[state, setter, reset, changed]` tuples
- `src/pages/Settings.tsx`: 1254 lines, 30+ useState/useEffect blocks, 30+ onChange handlers
- every new preference = 4 edits (store interface, store impl, useSettingsState, Settings.tsx)
- boolean prefs (`enableThumbnails`, `enableAutoplay`, etc.) have identical boilerplate 30 times over

**why it matters.** the single largest line-count hotspot in the entire frontend. impossible to reason about which prefs are "dirty" without scrolling 400 lines. scaling problem: adding the 31st pref is a 100-line PR.

**expected impact.**
- removes ~600 lines from `useSettingsState.ts` (becomes generic)
- removes ~500 lines from `Settings.tsx` (renders field list generically)
- adding a new pref becomes: declare in schema, declare in store. ~10 lines.

**scope.**
- introduce `src/stores/preferences/schema.ts` listing all prefs with `{ key, label, description, type, default, group }`
- rewrite `useSettingsState` to be schema-driven (~80 lines)
- convert `Settings.tsx` to render fields from schema (with escape hatches for complex prefs like `proxyUrls`)

**prereqs / risks.** medium risk: settings page has special-cased rendering for some prefs (theme picker, color pickers, keyboard shortcuts). phase 1: convert all simple boolean/array prefs. phase 2: complex ones (theme, keyboard, language).

**user-facing breaking change**: no.

---

### F. replace inline SVG icons with `lucide-react`

**problem.**
- `src/components/Icon.tsx`: 211 lines, ~90 inline SVG paths, plus enum + lookup map
- no tree-shaking: every icon is in the bundle regardless of use
- many icons are FA Pro 6.0 (commercial license in comments — actual license unclear)

**why it matters.** bundle size: full icon library is likely 200-400KB uncompressed. maintainability: adding an icon means editing two places (enum + map). licensing: FA Pro is not free for commercial use.

**expected impact.**
- removes 211-line file
- tree-shakable icons: only used icons ship
- consistent icon style (lucide is one design system)

**scope.**
- `src/components/Icon.tsx` (delete, replace with `lucide-react` direct usage)
- ~150 call sites across `src/components/**` — replace `Icons.SEARCH` → `Search`, etc.

**prereqs / risks.** visual: lucide icons will look different. need a design review pass. mechanical risk: many call sites, but each change is simple (`Icons.X` → `<X />`).

**user-facing breaking change**: yes — visual change. should be a clearly labeled release.

---

### G. replace `classnames` with `clsx` and remove `lodash.merge`

**problem.**
- `classnames` is used everywhere (~200+ files); fine, but `clsx` is smaller, faster, more modern
- `lodash.merge` is used in **exactly two stores** (`quality`, `subtitles`) — for a `merge` function that's effectively `{ ...current, ...persisted }`. native spread does the same thing.

**why it matters.** `lodash.merge` is ~25KB; the usage is trivially replaceable. `classnames` → `clsx` is a 0.3KB savings and faster.

**expected impact.**
- removes `lodash.merge` + `@types/lodash.merge`
- bundle savings: ~25KB

**scope.**
- `src/stores/quality/index.ts`
- `src/stores/subtitles/index.ts`

**prereqs / risks.** very low risk; the merge usage is shallow (one level deep).

**user-facing breaking change**: no.

---

### H. drop unused/dead deps

**verified unused by grep across `src/`, `themes/`, `plugins/`, `index.html`, `vite.config.mts`:**
- `million` (zero imports — installed in `node_modules` but never referenced)
- `react-sticky-el` (zero imports)
- `react-google-recaptcha-v3` (superseded by `@marsidev/react-turnstile`)

**used but questionable:**
- `react-lazy-with-preload` (3 call sites; equivalent can be done with `React.lazy` + manual preload in 5 lines)
- `node-forge` (covered by C)
- `crypto-js` (covered by C)
- `core-js` (used by babel preset-env for polyfill entry; could be removed if we trust browser targets)

**why it matters.** faster installs, smaller node_modules, fewer surfaces for supply-chain attacks. `million` is a particularly heavy "maybe we should use this" dep — drop it.

**expected impact.**
- removes ~50MB from node_modules
- removes 5 entries from package.json

**scope.** `package.json` + lockfile.

**prereqs / risks.** low risk for the unused deps; need to verify `react-lazy-with-preload` rewrites work.

**user-facing breaking change**: no.

---

### I. unify localStorage persistence on zustand `persist` (or a single helper)

**problem.**
- ~10 stores use `zustand/middleware/persist`
- ~5 features use raw `localStorage.getItem`/`setItem` directly: notifications read state (`NotificationModal.tsx`), m3u8 proxy enablement (`fetchers.ts`), modal-dismissed flags (`Modal.tsx`), `__CONFIG__` injection (`config.ts`), and `__legacy_migrated_v1` (after migration)
- these are scattered, not type-safe, and not observable

**why it matters.** hard to reason about "where does this user state live?". raw localStorage bypasses immer and zustand subscriptions.

**expected impact.**
- small win: ~5 places get consolidated, all user state becomes queryable in devtools
- enables a future "export settings" feature

**scope.**
- `src/components/overlays/notificationsModal/**` (move read state into a store)
- `src/backend/providers/fetchers.ts` (move m3u8 enablement into a store)
- `src/components/overlays/Modal.tsx` (FancyModal one-time flag)

**prereqs / risks.** low risk; cosmetic refactor.

**user-facing breaking change**: no (data shape preserved).

---

### J. kill the handlebars index.html plugin (mostly)

**problem.** `plugins/handlebars.ts` + `viteStaticCopy` + `handlebars` dep + a glob of `*.hbs` templates exist to:
1. inject `opensearchEnabled` into `index.html`
2. inject `routeDomain` (browser vs hash router) into `index.html`
3. copy `*.hbs` files into dist

**why it matters.**
- 30+ deps added via `handlebars` for what amounts to 3 string substitutions
- the `*.hbs` static copy is unused (verified — `globSync("src/assets/**/**.hbs")` returns empty)
- `routeDomain` is dead code: `NORMAL_ROUTER` is the only consumer and the runtime router handles both modes

**expected impact.**
- removes `handlebars` dep (~50KB)
- removes `glob` dep (~30KB)
- removes 2 plugins from vite config
- `index.html` becomes a normal template

**scope.**
- `plugins/handlebars.ts` (delete)
- `vite.config.mts` (remove `handlebars()` and `viteStaticCopy`)
- `index.html` (hardcode the few values, or use `transformIndexHtml` in vite config)

**prereqs / risks.** need to confirm opensearch really needs to be templated (could be a runtime check instead).

**user-facing breaking change**: no.

---

### K. split monolithic `useDiscoverMedia` (685 lines)

**problem.** `src/pages/discover/hooks/useDiscoverMedia.ts` is 685 lines, contains 5 `fetchXxx` functions (`fetchTMDBMedia`, `fetchTraktMedia`, `fetchEditorPicks`, `fetchRecommendationsWithFedSimilar`, `fetchMedia`), a giant `switch` statement, and 14 dependencies. Hard to test or modify without regression risk.

**why it matters.** central bottleneck for any new discover content type. mixed responsibilities (data fetching, fallback logic, pagination, title translation). can't test individual fetch paths without mocking the entire hook.

**expected impact.** splits into ~5 focused hooks (one per content type). `useDiscoverMedia` becomes a thin orchestrator (~80 lines).

**scope.**
- `src/pages/discover/hooks/useDiscoverMedia.ts`
- `src/pages/discover/hooks/` (new files)

**prereqs / risks.** low risk; pure refactor.

**user-facing breaking change**: no.

---

### L. simplify the overlay router (or replace with a lighter pattern)

**problem.**
- `OverlayRouter.tsx` uses `@react-spring/web` for a single dimension transition (height/width)
- the router lives on top of `react-router-dom`'s `?r=...` query param
- `OverlayDisplay.tsx` patches `window.unhandledrejection` to swallow `matches.call` errors from `focus-trap-react` (very fragile)
- `useRouterAnchorUpdate` measures anchor positions via DOM APIs on every resize

**why it matters.**
- `@react-spring/web` (~30KB) for one animation
- the global `unhandledrejection` handler is a smell — catches and silences any error matching "matches.call" anywhere in the app
- the anchor-position system is clever but complex

**expected impact.**
- removes `@react-spring/web` (~30KB)
- removes the global error handler hack
- could replace with native CSS transitions + `transition-group`

**scope.**
- `src/components/overlays/OverlayRouter.tsx`
- `src/components/overlays/OverlayDisplay.tsx`
- `src/hooks/useOverlayRouter.ts`

**prereqs / risks.** medium-high risk: this is the player overlay system, used heavily. the matches.call workaround exists for a reason — `focus-trap-react` has a known bug. need to investigate root cause or pin a fix.

**user-facing breaking change**: no (cosmetic transition differences possible).

---

### M. unify the `App.tsx` maintenance flag

**problem.** `src/setup/App.tsx:194`:
```ts
const maintenance = false; // Shows maintance page
export const maintenanceTime = "March 31th 11:00 PM - 5:00 AM EST";
```
hard-coded `false` plus a stale date string from a past event.

**why it matters.** permanent dead code in the hot path. `MaintenancePage` component is also dead unless `maintenance` is toggled.

**expected impact.** removes ~30 lines of dead code + 1 component.

**scope.**
- `src/setup/App.tsx`
- `src/pages/errors/MaintenancePage.tsx` (delete)

**prereqs / risks.** none; the file says it's a feature, but the value is hard-coded false and the date is in the past.

**user-facing breaking change**: no.

---

### N. replace `react-google-recaptcha-v3` (superseded)

**problem.** `react-google-recaptcha-v3` is in deps. `@marsidev/react-turnstile` is also in deps and is the modern CF Turnstile library.

**why it matters.** two reCAPTCHA-like deps; one is legacy.

**expected impact.** removes `react-google-recaptcha-v3`.

**scope.** `package.json`. verify no imports, then delete.

**prereqs / risks.** low risk; need to confirm it's actually unused.

**user-facing breaking change**: no.

---

### O. drop `src/setup/ga.ts` duplicate

**problem.** `src/setup/ga.ts` and `src/utils/setup/ga.ts` are byte-identical (verified via `diff`). both are imported.

**why it matters.** confusing; pure dead-weight.

**expected impact.** removes 1 file.

**scope.** delete `src/setup/ga.ts` (or vice versa). update imports.

**prereqs / risks.** none.

**user-facing breaking change**: no.

---

### P. consolidate the TMDB `mediaTypeTo*` adapter layer

**problem.** `src/backend/metadata/tmdb.ts` exports 4 converter functions (`mediaTypeToTMDB`, `mediaItemTypeToMediaType`, `TMDBMediaToMediaType`, `TMDBMediaToMediaItemType`). All are trivial switch statements. They're called from many places. The `MWMediaType` enum itself is mostly an old artifact (it has `MOVIE`, `SERIES`, `ANIME` — `ANIME` is unused).

**why it matters.** 4 functions for what could be 2 type aliases. `MWMediaType` adds a layer of indirection for no clear gain. `getMetaFromId`, `formatTMDBMetaResult`, etc. all switch on `MWMediaType`.

**expected impact.**
- removes ~30 lines of trivial type adapters
- simplifies a chain of type conversions

**scope.**
- `src/backend/metadata/types/mw.ts` (consolidate or remove MWMediaType)
- `src/backend/metadata/tmdb.ts`
- callers

**prereqs / risks.** medium risk: many call sites; needs careful migration.

**user-facing breaking change**: no (internal type system).

---

### Q. remove the custom `events.ts` emitter (replace with native `EventTarget`)

**problem.** `src/utils/events.ts` implements a tiny pub/sub emitter (40 lines). Used by `DisplayInterface` to communicate between player internals and the store. `EventTarget` (native browser API) does this for free, with proper TypeScript support.

**why it matters.** 40 lines of custom code vs. zero. `EventTarget` is well-typed, well-tested, well-known. one less thing to learn for contributors.

**expected impact.**
- removes 40 lines
- improves type safety

**scope.**
- `src/utils/events.ts` (delete or alias)
- `src/components/player/display/displayInterface.ts` (change `Listener` to `EventTarget`)
- `src/components/player/display/base.ts`, `chromecast.ts`

**prereqs / risks.** low risk; `EventTarget` event payloads are typed via `CustomEvent<T>` maps.

**user-facing breaking change**: no.

---

### R. simplify `SimpleCache` or use `lru-cache`

**problem.** `src/utils/cache.ts` is a 95-line custom in-memory cache with TTL. Used by `subs.ts` for caption downloads (24h TTL). Not bad, but trivial to replace with `Map` + TTL, or use `lru-cache` from npm (well-tested).

**why it matters.** 95 lines for what is essentially a TTL-bounded Map. no LRU eviction, no max size — pure TTL only.

**expected impact.**
- removes 95 lines, or replaces with `lru-cache` for free LRU

**scope.** `src/utils/cache.ts`.

**prereqs / risks.** low risk; behavior preserved.

**user-facing breaking change**: no.

---

### S. collapse the 3 update queues pattern

**problem.** `useBookmarkStore` has `updateQueue` AND `traktUpdateQueue`. Same items pushed to both in `removeBookmark`, `addBookmark`, `addBookmarkWithGroups`. They diverge only in network target.

**why it matters.** every mutation duplicates 4 lines (`s.updateQueue.push(item); s.traktUpdateQueue.push(item);`). two queues to drain; two sync components.

**expected impact.**
- removes ~30 lines from bookmark store
- removes one sync component (after change B)

**scope.**
- `src/stores/bookmarks/index.ts`
- `src/stores/trakt/TraktBookmarkSyncer.tsx`

**prereqs / risks.** low risk; pure consolidation.

**user-facing breaking change**: no.

---

### T. drop the `__old/__old` workaround for legacy migration

this is bundled with change A.

---

## 3. recommended implementation order

### phase 1 — quick wins (1–2 days total)
- **O** — delete duplicate `ga.ts` (5 min)
- **M** — remove hardcoded maintenance flag (15 min)
- **N** — drop `react-google-recaptcha-v3` if unused (15 min)
- **H** — remove `million`, `react-sticky-el`, `react-lazy-with-preload` (replace call sites; 1-2 hours)
- **Q** — replace `events.ts` with native `EventTarget` (2-3 hours)
- **R** — replace `SimpleCache` with `Map` + TTL or `lru-cache` (1 hour)
- **S** — collapse bookmark dual queues (1 hour)
- **G** — drop `lodash.merge`, optionally swap `classnames` for `clsx` (30 min)

**rationale**: all low risk, no user-facing impact, fast to ship.

### phase 2 — dep & build hygiene (2–3 days)
- **D** — pick one package manager, delete the other lockfile, update CI + Dockerfile
- **J** — remove handlebars plugin + `handlebars` + `glob` deps
- **C** — replace `node-forge`/`crypto-js` with web crypto + `@noble/*` (the biggest single change in this phase; needs coordination with backend)

**rationale**: reduces bundle size meaningfully, removes 1-2MB of unused code, no user-visible change.

### phase 3 — architectural consolidation (1–2 weeks)
- **A** — gate legacy migration behind a one-shot flag, ship a release, delete `__old/` 6 months later
- **B** — collapse 8 syncers into one declarative layer
- **K** — split `useDiscoverMedia` into focused hooks
- **I** — unify localStorage persistence on zustand stores
- **P** — simplify `MWMediaType` adapter layer

**rationale**: structural improvements that compound. each one makes the next easier.

### phase 4 — large refactors (deferred, decide before committing)
- **E** — schema-driven settings (biggest LOC reduction; medium risk)
- **F** — replace inline SVG icons with lucide (biggest visual change; needs design buy-in)
- **L** — simplify overlay router (highest visual risk; needs deep testing)

**rationale**: highest-leverage but highest-risk; ship phases 1-3 first to de-risk.

### sequencing decisions
- **phase 1 first** because they don't depend on anything and prove the refactor velocity
- **phase 2 next** because deps/build improvements are non-breaking
- **phase 3** because they touch hot paths but are mechanical
- **phase 4 last** because they require design input + extensive QA

---

## 4. changes considered but NOT recommended

### "rewrite the player in SolidJS / Preact"
**why not**: the player is the most-tested, most-used code. rewriting it would be a months-long project with no immediate payoff. the existing TSX/React stack is fine; specific optimizations can be done in place.

### "replace zustand with Redux Toolkit / Jotai"
**why not**: zustand is well-suited here. the slice pattern works. no compelling reason to migrate.

### "migrate to React Router v7 / Tanstack Router"
**why not**: react-router-dom v6 works fine. Tanstack would add complexity for marginal benefit. v7 of react-router would be a routine upgrade — could be done as a small independent PR.

### "replace Tailwind with CSS Modules / vanilla-extract"
**why not**: huge undertaking; no functional benefit. Tailwind is fine.

### "adopt TypeScript strict mode + branded types everywhere"
**why not**: already using `"strict": true`. branded types add ceremony; not high-value here.

### "build a service worker for offline mode"
**why not**: already have `vite-plugin-pwa` configured. offline mode for a streaming app is fundamentally limited (can't download HLS). not worth the work.

### "switch from `crypto-js` and `node-forge` to `jose`"
**why not**: `jose` is great but heavier than what we need. web crypto + `@noble/curves` covers everything with less bundle weight.

### "rewrite i18n with `react-intl` or FormatJS"
**why not**: i18next works fine. 55 locales is fine to bundle (they're small JSON). no compelling reason.

### "consolidate dev tooling: drop biome, use eslint+prettier"
**why not**: biome is faster and already configured. no upside.

### "add testing — unit + e2e"
**why not recommended in this proposal**: this should be a parallel track. the codebase is large enough that retrofitting tests is a months-long effort. recommendation: add tests as part of each phase change, not as its own track. e.g. when refactoring `useDiscoverMedia`, write tests for the new hooks.

### "remove the focus-trap-react matches.call workaround"
**why not (yet)**: the workaround is there because the library has a real bug. until we confirm a fixed version or replace the library, removing it risks breaking focus management for keyboard users.

### "adopt million (or react compiler) for perf"
**why not**: million is installed but zero-imported — dead weight. the actual perf bottlenecks in this codebase (syncer polling, overlay re-measurement, language-store subscriptions, caption re-renders) are not VDOM problems. react compiler is more promising if perf becomes a real issue, but only AFTER the architectural cleanups in phases 1-3, which will likely buy more perf than any compiler.

---

## summary metrics

| metric | current | after phases 1-3 | after phase 4 (if approved) |
|---|---|---|---|
| source LOC | ~68k | ~62k (-9%) | ~55k (-19%) |
| source files | 475 | ~445 | ~400 |
| dependencies (deps) | ~50 | ~38 | ~36 |
| dependencies (devDeps) | ~45 | ~42 | ~42 |
| duplicate persistence layers | 4 | 1 | 1 |
| root-mounted side-effect components | 8 | 1 | 1 |
| lockfiles | 2 | 1 | 1 |
| tests | 0 | some | more |

---

## approval log

| phase | proposed | approved | completed |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |