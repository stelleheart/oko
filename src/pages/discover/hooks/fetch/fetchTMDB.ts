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

// ponytail: 5-min in-memory cache for carousel fetches. Same TMDB endpoint
// (with same params + language + page) is hit by every carousel on every
// mount, and again on tab switch. Real upstream cache would be ideal; this
// covers in-session re-mounts and tab switches without persisting stale data.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface TMDBResult {
	results: any[];
	hasMore: boolean;
}

const tmdbCache = new Map<string, { ts: number; value: TMDBResult }>();

function cacheKey(
	endpoint: string,
	params: Record<string, any>,
	formattedLanguage: string,
	page: number,
	isCarouselView: boolean,
	mediaType: string,
) {
	return `${endpoint}::${formattedLanguage}::${page}::${isCarouselView ? 1 : 0}::${mediaType}::${JSON.stringify(params)}`;
}

export async function fetchTMDBMedia({
	endpoint,
	params = {},
	page,
	isCarouselView,
	formattedLanguage,
	mediaType,
}: FetchTMDBParams): Promise<TMDBResult> {
	// For carousel views, we only need one page of results
	if (isCarouselView) {
		params.page = "1"; // Always use first page for carousels
	} else {
		params.page = page.toString(); // Use the requested page for "view more" pages
	}

	const key = cacheKey(
		endpoint,
		params,
		formattedLanguage,
		page,
		isCarouselView,
		mediaType,
	);
	const hit = tmdbCache.get(key);
	if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
		return hit.value;
	}

	try {
		const data = await get<any>(endpoint, {
			api_key: conf().TMDB_READ_API_KEY,
			language: formattedLanguage,
			...params,
		});

		// For carousel views, we might want to limit the number of results
		const results = isCarouselView ? data.results.slice(0, 20) : data.results;

		const value = {
			results: results.map((item: any) => ({
				...item,
				type: mediaType === "movie" ? "movie" : "show",
			})),
			hasMore: page < data.total_pages,
		};
		tmdbCache.set(key, { ts: Date.now(), value });
		return value;
	} catch (err) {
		console.error("Error fetching TMDB media:", err);
		throw err;
	}
}
