import {
  getLatest4KReleases,
  getLatestReleases,
  getLatestTVReleases,
  getTop10Movies,
} from "@/backend/metadata/traktApi";
import type { TraktListResponse } from "@/backend/metadata/types/trakt";
import type { DiscoverContentType, MediaType } from "@/pages/discover/types/discover";

import { getTraktProviderFunction } from "./fetchTrakt";

export interface FetchMediaParams {
  contentType: DiscoverContentType;
  mediaType: MediaType;
  id?: string;
  genreName?: string;
  providerName?: string;
  mediaTitle?: string;
  t: (key: string, options?: any) => string;
}

export interface FetchMediaResult {
  results: any[];
  hasMore: boolean;
  sectionTitle: string;
}

// Wrapper-shaped dependency hooks. The orchestrator hook wraps each
// fetcher with useCallback so consumers can pass the same ergonomic
// (endpoint, params?) / (traktFunction) signatures as the original
// useDiscoverMedia internals. Each wrapper takes only the per-call
// arguments; values that don't change between calls (page, isCarouselView,
// formattedLanguage, mediaType) are captured by the wrapper's closure.
export interface FetchMediaDeps {
  fetchTMDBMedia: (
    endpoint: string,
    params?: Record<string, any>,
  ) => Promise<{ results: any[]; hasMore: boolean }>;
  fetchTraktMedia: (
    traktFunction: () => Promise<TraktListResponse>,
  ) => Promise<{ results: any[]; hasMore: boolean }>;
  fetchEditorPicks: () => Promise<{ results: any[]; hasMore: boolean }>;
  fetchRecommendationsWithFedSimilar: (
    mediaId: string,
  ) => Promise<{ results: any[]; hasMore: boolean }>;
}

function providerTitle(
  mediaType: MediaType,
  providerName: string | undefined,
  t: (key: string, options?: any) => string,
): string {
  return mediaType === "movie"
    ? t("discover.carousel.title.moviesOn", { provider: providerName })
    : t("discover.carousel.title.tvshowsOn", { provider: providerName });
}

export async function fetchMedia(
  params: FetchMediaParams,
  deps: FetchMediaDeps,
): Promise<FetchMediaResult> {
  const {
    contentType: type,
    mediaType,
    id,
    genreName,
    providerName,
    mediaTitle,
    t,
  } = params;

  const {
    fetchTMDBMedia: doTMDB,
    fetchTraktMedia: doTrakt,
    fetchEditorPicks: doEditorPicks,
    fetchRecommendationsWithFedSimilar: doRecommendations,
  } = deps;

  let data: { results: any[]; hasMore: boolean };
  let sectionTitle: string;

  // Map content types to their endpoints and handling logic. The switch
  // is intentionally kept verbose here so each branch is locally readable
  // and easy to diff against the original code.
  switch (type) {
    case "popular":
      data = await doTMDB(`/${mediaType}/popular`);
      sectionTitle = t("discover.carousel.title.popular");
      break;
    case "topRated":
      data = await doTMDB(`/${mediaType}/top_rated`);
      sectionTitle = t("discover.carousel.title.topRated");
      break;
    case "onTheAir":
      if (mediaType !== "tv") throw new Error("onTheAir is only available for TV shows");
      data = await doTMDB("/tv/on_the_air");
      sectionTitle = t("discover.carousel.title.onTheAir");
      break;
    case "nowPlaying":
      if (mediaType !== "movie") throw new Error("nowPlaying is only available for movies");
      data = await doTMDB("/movie/now_playing");
      sectionTitle = t("discover.carousel.title.inCinemas");
      break;
    case "top10":
      data = await doTrakt(getTop10Movies);
      sectionTitle = t("discover.carousel.title.top10");
      break;
    case "latest":
      data = await doTrakt(getLatestReleases);
      sectionTitle = t("discover.carousel.title.latestReleases");
      break;
    case "latest4k":
      data = await doTrakt(getLatest4KReleases);
      sectionTitle = t("discover.carousel.title.4kReleases");
      break;
    case "latesttv":
      data = await doTrakt(getLatestTVReleases);
      sectionTitle = t("discover.carousel.title.latestTVReleases");
      break;
    case "genre":
      if (!id) throw new Error("Genre ID is required");
      data = await doTMDB(`/discover/${mediaType}`, { with_genres: id });
      sectionTitle =
        mediaType === "movie"
          ? t("discover.carousel.title.movies", { category: genreName })
          : t("discover.carousel.title.tvshows", { category: genreName });
      break;
    case "provider":
      if (!id) throw new Error("Provider ID is required");
      // Try to use Trakt provider endpoint if available
      const traktProviderFunction = getTraktProviderFunction(mediaType, id);
      if (traktProviderFunction) {
        try {
          data = await doTrakt(traktProviderFunction);
          sectionTitle = providerTitle(mediaType, providerName, t);
        } catch (traktErr) {
          console.error("Trakt provider fetch failed, falling back to TMDB:", traktErr);
          // Fall back to TMDB
          data = await doTMDB(`/discover/${mediaType}`, {
            with_watch_providers: id,
            watch_region: "US",
          });
          sectionTitle = providerTitle(mediaType, providerName, t);
        }
      } else {
        // Use TMDB if no Trakt endpoint exists for this provider
        data = await doTMDB(`/discover/${mediaType}`, {
          with_watch_providers: id,
          watch_region: "US",
        });
        sectionTitle = providerTitle(mediaType, providerName, t);
      }
      break;
    case "recommendations":
      if (!id) throw new Error("Media ID is required for recommendations");
      data = await doRecommendations(id);
      sectionTitle = t("discover.carousel.title.recommended", { title: mediaTitle });
      break;
    case "editorPicks":
      data = await doEditorPicks();
      sectionTitle =
        mediaType === "movie"
          ? t("discover.carousel.title.editorPicksMovies")
          : t("discover.carousel.title.editorPicksShows");
      break;
    default:
      throw new Error(`Unsupported content type: ${type}`);
  }

  return { ...data, sectionTitle };
}
