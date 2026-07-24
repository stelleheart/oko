import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { get } from "@/backend/metadata/tmdb";
import {
  EDITOR_PICKS_MOVIES,
  EDITOR_PICKS_TV_SHOWS,
  MOVIE_PROVIDERS,
  TV_PROVIDERS,
} from "@/pages/discover/types/discover";
import type {
  DiscoverContentType,
  DiscoverMedia,
  Genre,
  MediaType,
  Provider,
  UseDiscoverMediaProps,
  UseDiscoverMediaReturn,
} from "@/pages/discover/types/discover";
import { conf } from "@/setup/config";
import { useLanguageStore } from "@/stores/language";
import { getTmdbLanguageCode } from "@/utils/language";

import { fetchEditorPicks } from "./fetch/fetchEditorPicks";
import { fetchMedia as fetchMediaByPath } from "./fetch/fetchMedia";
import { fetchRecommendationsWithFedSimilar } from "./fetch/fetchRecommendations";
import { fetchTMDBMedia } from "./fetch/fetchTMDB";
import { fetchTraktMedia, getTraktProviderFunction } from "./fetch/fetchTrakt";

// Re-export types for backward compatibility
export type {
  DiscoverContentType,
  DiscoverMedia,
  Genre,
  MediaType,
  Provider,
  UseDiscoverMediaProps,
  UseDiscoverMediaReturn,
};

// Re-export constants for backward compatibility
export {
  EDITOR_PICKS_MOVIES,
  EDITOR_PICKS_TV_SHOWS,
  MOVIE_PROVIDERS,
  TV_PROVIDERS,
};

export function useDiscoverOptions(mediaType: MediaType) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  const providers = mediaType === "movie" ? MOVIE_PROVIDERS : TV_PROVIDERS;

  useEffect(() => {
    const fetchGenres = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await get<any>(`/genre/${mediaType}/list`, {
          api_key: conf().TMDB_READ_API_KEY,
          language: formattedLanguage,
        });
        setGenres(data.genres.slice(0, 50));
      } catch (err) {
        console.error(`Error fetching ${mediaType} genres:`, err);
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGenres();
  }, [mediaType, formattedLanguage]);

  return {
    genres,
    providers,
    isLoading,
    error,
  };
}

export function useDiscoverMedia({
  contentType,
  mediaType,
  id,
  fallbackType,
  page = 1,
  genreName,
  providerName,
  mediaTitle,
  isCarouselView = false,
  enabled = true,
}: UseDiscoverMediaProps): UseDiscoverMediaReturn {
  const [media, setMedia] = useState<DiscoverMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sectionTitle, setSectionTitle] = useState<string>("");
  const [currentContentType, setCurrentContentType] =
    useState<string>(contentType);
  const [actualContentType, setActualContentType] =
    useState<DiscoverContentType>(contentType);

  const { t } = useTranslation();
  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  // Reset media when content type or media type changes
  useEffect(() => {
    if (contentType !== currentContentType) {
      setMedia([]);
      setCurrentContentType(contentType);
      setActualContentType(contentType); // Reset actual content type to original
    }
  }, [contentType, currentContentType]);

  const fetchTMDB = useCallback(
    (endpoint: string, params: Record<string, any> = {}) =>
      fetchTMDBMedia({
        endpoint,
        params,
        page,
        isCarouselView,
        formattedLanguage,
        mediaType,
      }),
    [formattedLanguage, page, mediaType, isCarouselView],
  );

  const fetchTrakt = useCallback(
    (traktFunction: () => Promise<any>) =>
      fetchTraktMedia({
        traktFunction,
        page,
        isCarouselView,
        formattedLanguage,
        mediaType,
      }),
    [mediaType, formattedLanguage, page, isCarouselView],
  );

  const fetchEditorPicksForMedia = useCallback(
    () =>
      fetchEditorPicks({
        mediaType,
        isCarouselView,
        formattedLanguage,
      }),
    [mediaType, formattedLanguage, isCarouselView],
  );

  const fetchRecommendationsWithFedSimilarForMedia = useCallback(
    (mediaId: string) =>
      fetchRecommendationsWithFedSimilar({
        mediaId,
        mediaType,
        isCarouselView,
        page,
        formattedLanguage,
        fetchTMDBMedia: fetchTMDB,
      }),
    [mediaType, isCarouselView, page, formattedLanguage, fetchTMDB],
  );

  const getTraktProviderFn = useCallback(
    (providerId: string) => getTraktProviderFunction(mediaType, providerId),
    [mediaType],
  );

  const fetchMedia = useCallback(async () => {
    // Skip fetching recommendations if no ID is provided
    if (contentType === "recommendations" && !id) {
      setIsLoading(false);
      setMedia([]);
      setHasMore(false);
      setSectionTitle("");
      return;
    }

    setIsLoading(true);
    setError(null);

    const attemptFetch = async (type: DiscoverContentType) => {
      return fetchMediaByPath(
        {
          contentType: type,
          mediaType,
          id,
          genreName,
          providerName,
          mediaTitle,
          t,
        },
        {
          fetchTMDBMedia: fetchTMDB,
          fetchTraktMedia: fetchTrakt,
          fetchEditorPicks: fetchEditorPicksForMedia,
          fetchRecommendationsWithFedSimilar:
            fetchRecommendationsWithFedSimilarForMedia,
        },
      );
    };

    try {
      const data = await attemptFetch(contentType);
      setSectionTitle(data.sectionTitle);
      setMedia((prevMedia) => {
        // If page is 1, replace the media array, otherwise append
        return page === 1 ? data.results : [...prevMedia, ...data.results];
      });
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Error fetching media:", err);
      setError((err as Error).message);

      // Try fallback content type if available
      if (fallbackType && fallbackType !== contentType) {
        console.info(`Falling back from ${contentType} to ${fallbackType}`);
        try {
          const fallbackData = await attemptFetch(fallbackType);
          setActualContentType(fallbackType); // Set actual content type to fallback
          setSectionTitle(fallbackData.sectionTitle);
          setMedia((prevMedia) => {
            // If page is 1, replace the media array, otherwise append
            return page === 1
              ? fallbackData.results
              : [...prevMedia, ...fallbackData.results];
          });
          setHasMore(fallbackData.hasMore);
          setError(null); // Clear error if fallback succeeds
        } catch (fallbackErr) {
          console.error("Error fetching fallback media:", fallbackErr);
          setError((fallbackErr as Error).message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    contentType,
    mediaType,
    id,
    fallbackType,
    genreName,
    providerName,
    mediaTitle,
    fetchTMDB,
    fetchTrakt,
    fetchEditorPicksForMedia,
    fetchRecommendationsWithFedSimilarForMedia,
    t,
    page,
    getTraktProviderFn,
  ]);

  useEffect(() => {
    // Reset media when content type, media type, or id changes
    if (contentType !== currentContentType || page === 1) {
      setMedia([]);
      setCurrentContentType(contentType);
    }
    // Only fetch when enabled
    if (enabled) {
      fetchMedia();
    }
  }, [fetchMedia, contentType, currentContentType, page, id, enabled]);

  return {
    media,
    isLoading,
    error,
    hasMore,
    refetch: fetchMedia,
    sectionTitle,
    actualContentType,
  };
}
