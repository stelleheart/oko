import { get } from "@/backend/metadata/tmdb";
import {
  PROVIDER_TO_TRAKT_MAP,
  getAppleMovieReleases,
  getAppleTVReleases,
  getDisneyMovies,
  getDisneyTVShows,
  getHBOMovies,
  getHBOTVShows,
  getHuluMovies,
  getHuluTVShows,
  getNetflixMovies,
  getNetflixTVShows,
  getParamountMovies,
  getParamountTVShows,
  getPrimeMovies,
  getPrimeTVShows,
} from "@/backend/metadata/traktApi";
import { paginateResults } from "@/backend/metadata/traktFunctions";
import type { TraktListResponse } from "@/backend/metadata/types/trakt";
import { conf } from "@/setup/config";

export interface FetchTraktParams {
  traktFunction: () => Promise<TraktListResponse>;
  page: number;
  isCarouselView: boolean;
  formattedLanguage: string;
  mediaType: "movie" | "tv";
}

export async function fetchTraktMedia({
  traktFunction,
  page,
  isCarouselView,
  formattedLanguage,
  mediaType,
}: FetchTraktParams) {
  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<TraktListResponse>((_, reject) => {
      setTimeout(() => reject(new Error("Trakt request timed out")), 3000);
    });

    // Race between the Trakt request and timeout
    const response = await Promise.race([traktFunction(), timeoutPromise]);

    // Check if response is null
    if (!response) {
      throw new Error("Trakt API returned null response");
    }

    // Paginate the results
    const pageSize = isCarouselView ? 20 : 100; // Limit to 20 items for carousels, get more for detailed views
    const { tmdb_ids: tmdbIds, hasMore: hasMoreResults } = paginateResults(
      response,
      page,
      pageSize,
      mediaType === "movie" ? "movie" : mediaType === "tv" ? "tv" : "both",
    );

    // For carousel views, we only need to fetch details for displayed items
    const idsToFetch = isCarouselView ? tmdbIds.slice(0, 20) : tmdbIds;

    // Fetch details for each TMDB ID
    const mediaPromises = idsToFetch.map(async (tmdbId: number) => {
      const endpoint = `/${mediaType}/${tmdbId}`;
      try {
        const data = await get<any>(endpoint, {
          api_key: conf().TMDB_READ_API_KEY,
          language: formattedLanguage,
        });
        return {
          ...data,
          type: mediaType === "movie" ? "movie" : "show",
        };
      } catch (err) {
        console.error(`Error fetching details for TMDB ID ${tmdbId}:`, err);
        return null; // Return null for failed items
      }
    });

    // Use Promise.allSettled to handle failed requests gracefully
    const settledResults = await Promise.allSettled(mediaPromises);

    // Filter out failed requests and nulls
    const results = settledResults
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value);

    return {
      results,
      hasMore: hasMoreResults,
    };
  } catch (err) {
    console.error("Error fetching Trakt media:", err);
    throw err;
  }
}

// Get Trakt function for provider
export function getTraktProviderFunction(
  mediaType: "movie" | "tv",
  providerId: string,
) {
  // Create the key based on provider ID and media type
  const key = mediaType === "tv" ? `${providerId}tv` : providerId;
  const trakt =
    PROVIDER_TO_TRAKT_MAP[key as keyof typeof PROVIDER_TO_TRAKT_MAP];

  if (!trakt) return null;

  // Map trakt endpoint to corresponding function
  switch (trakt) {
    case "appletv":
      return getAppleTVReleases;
    case "applemovie":
      return getAppleMovieReleases;
    case "netflixmovies":
      return getNetflixMovies;
    case "netflixtv":
      return getNetflixTVShows;
    case "primemovies":
      return getPrimeMovies;
    case "primetv":
      return getPrimeTVShows;
    case "hulumovies":
      return getHuluMovies;
    case "hulutv":
      return getHuluTVShows;
    case "disneymovies":
      return getDisneyMovies;
    case "disneytv":
      return getDisneyTVShows;
    case "hbomovies":
      return getHBOMovies;
    case "hbotv":
      return getHBOTVShows;
    case "paramountmovies":
      return getParamountMovies;
    case "paramounttv":
      return getParamountTVShows;
    default:
      return null;
  }
}
