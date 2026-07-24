import { get } from "@/backend/metadata/tmdb";
import {
  EDITOR_PICKS_MOVIES,
  EDITOR_PICKS_TV_SHOWS,
} from "@/pages/discover/types/discover";
import { conf } from "@/setup/config";

export interface FetchEditorPicksParams {
  mediaType: "movie" | "tv";
  isCarouselView: boolean;
  formattedLanguage: string;
}

export async function fetchEditorPicks({
  mediaType,
  isCarouselView,
  formattedLanguage,
}: FetchEditorPicksParams) {
  const picks =
    mediaType === "movie" ? EDITOR_PICKS_MOVIES : EDITOR_PICKS_TV_SHOWS;

  // For carousel views, limit the number of picks to fetch
  const picksToFetch = isCarouselView ? picks.slice(0, 20) : picks;

  try {
    const mediaPromises = picksToFetch.map(async (item) => {
      const endpoint = `/${mediaType}/${item.id}`;
      const data = await get<any>(endpoint, {
        api_key: conf().TMDB_READ_API_KEY,
        language: formattedLanguage,
        append_to_response: "videos,images",
      });
      return {
        ...data,
        type: item.type,
      };
    });

    const results = await Promise.all(mediaPromises);
    return {
      results,
      hasMore: picks.length > picksToFetch.length,
    };
  } catch (err) {
    console.error("Error fetching editor picks:", err);
    throw err;
  }
}
