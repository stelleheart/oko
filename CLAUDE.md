# oko / p-stream

Stream aggregator web app — watches movies, TV shows, and anime from various providers.

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS** for styling
- **Zustand** for state management (player, preferences, auth, language stores)
- **React Router v6** for routing
- **hls.js** for HLS video playback
- **@p-stream/providers** (GitHub-hosted) for media provider sources
- **i18next** for internationalization

## Architecture

### Entry Point
`src/setup/App.tsx` — wraps everything in `Layout`, sets up modals (`DetailsModal`, `NotificationModal`, `KeyboardCommandsModal`, etc.), and declares routes.

### Pages
- `/` → `HomePage` (bookmarks, continue watching, featured carousels)
- `/browse` → discover movies/TV by genre/category
- `/media/:media` → player page with scraping and source selection
- `/settings` → preferences, connections, account
- `/onboarding` → first-run proxy and extension setup

### Player (`src/components/player/`)
The player is a complex overlay system:
- `Player.tsx` — main container
- `internals/VideoContainer.tsx` — wraps `<video>` element with HLS.js
- `atoms/*` — UI controls (Play, Pause, Volume, Progress, Captions, Settings, etc.)
- `internals/ScrapeCard.tsx` — shows scraping progress per source
- Scraping flow: `useProviderScrape.tsx` → `useScrape` → backend `/scrape` endpoint

### Backend /api Routes
Vite proxy to backend services (configured in `vite.config.mts`):
- `/api/*` — app backend (auth, scraping, metadata)
- `/discover/*` — TMDB proxy for movie/TV data
- `/metrics/*` — provider scrape metrics reporting

### Scraping Flow
1. User selects media → `useProviderScrape` hook initializes scraping segments
2. Backend `/scrape` endpoint calls `@p-stream/providers` to find stream sources
3. Sources are returned and converted to playable streams via `convertRunoutputToSource`
4. HLS.js handles playback, captions loaded from various providers

### Stores (Zustand)
| Store | File | Purpose |
|-------|------|---------|
| `playerStore` | `src/stores/player/` | Video playback state, meta, captions, source |
| `preferencesStore` | `src/stores/preferences/` | UX toggles, source order, debrid, proxy |
| `authStore` | `src/stores/auth/` | User auth, passphrase, Trakt |
| `languageStore` | `src/stores/language/` | UI language + TMDB language code |
| `bookmarkStore` | `src/stores/bookmarks/` | Bookmarks, favorite episodes |
| `progressStore` | `src/stores/progress/` | Watch history, resume positions |
| `interfaceStore` | `src/stores/interface/` | Overlays, modals, toasts |

### Key Types
- `PlayerMeta` — `{ type: "movie"|"show", title, tmdbId, episode?, season? }`
- `SourceSliceSource` — playable stream source
- `CaptionListItem` — subtitle with language, url, srtData, proxy flag
- `ProviderMetric` — scrape result reporting to metrics endpoint

### Providers
Static lists in `src/pages/discover/types/discover.ts`:
- `MOVIE_PROVIDERS` and `TV_PROVIDERS` — TMDB provider IDs for streaming services
- Scraping uses `@p-stream/providers` which defines actual source implementations

### Styling
- Tailwind + `tailwindcss-themer` for theming
- Custom theme modal for color customization
- Component variants in `src/components/buttons/`, `src/components/layout/`, etc.

### Other Notable
- **Trakt.tv integration** — auth handler, scrobbling
- **PWA** — service worker via `vite-plugin-pwa`
- **i18n** — i18next with en/tr/ru/de/etc. translations in `src/setup/i18n`
- **Keyboard shortcuts** — configurable, stored in preferences
- **WatchParty** — built-in watch party feature via backend reporter