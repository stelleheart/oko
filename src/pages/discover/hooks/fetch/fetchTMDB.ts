import { get } from "@/backend/metadata/tmdb";
import { conf } from "@/setup/config";

export interface FetchTMDBParams {
  endpoint: string;
  params?: Record<string, any>;
  page: number;
  isCarouselView: boolean;
  formattedLanguage: string;
  mediaType: "movie" | "tv";
}

export async function fetchTMDBMedia({
  endpoint,
  params = {},
  page,
  isCarouselView,
  formattedLanguage,
  mediaType,
}: FetchTMDBParams) {
  try {
    // For carousel views, we only need one page of results
    if (isCarouselView) {
      params.page = "1"; // Always use first page for carousels
    } else {
      params.page = page.toString(); // Use the requested page for "view more" pages
    }

    const data = await get<any>(endpoint, {
      api_key: conf().TMDB_READ_API_KEY,
      language: formattedLanguage,
      ...params,
    });

    // For carousel views, we might want to limit the number of results
    const results = isCarouselView ? data.results.slice(0, 20) : data.results;

    return {
      results: results.map((item: any) => ({
        ...item,
        type: mediaType === "movie" ? "movie" : "show",
      })),
      hasMore: page < data.total_pages,
    };
  } catch (err) {
    console.error("Error fetching TMDB media:", err);
    throw err;
  }
}
