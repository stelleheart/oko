import { useInitializePlayer } from "@/components/player/hooks/useInitializePlayer";
import type {
	CaptionListItem,
	LanguageStream,
	PlayerMeta,
	PlayerStatus,
} from "@/stores/player/slices/source";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import type { SourceSliceSource } from "@/stores/player/utils/qualities";
import type { ProgressMediaItem } from "@/stores/progress";
import { useProgressStore } from "@/stores/progress";

export interface Source {
	url: string;
	type: "hls" | "mp4";
}

function getProgress(
	items: Record<string, ProgressMediaItem>,
	meta: PlayerMeta | null,
): number {
	const item = items[meta?.tmdbId ?? ""];
	if (!item || !meta) return 0;
	if (meta.type === "movie") {
		if (!item.progress) return 0;
		return item.progress.watched;
	}

	const ep = item.episodes[meta.episode?.tmdbId ?? ""];
	if (!ep) return 0;
	return ep.progress.watched;
}

export function usePlayer() {
	const setStatus = usePlayerStore((s) => s.setStatus);
	const setMeta = usePlayerStore((s) => s.setMeta);
	const setSource = usePlayerStore((s) => s.setSource);
	const setCaption = usePlayerStore((s) => s.setCaption);
	const setSourceId = usePlayerStore((s) => s.setSourceId);
	const status = usePlayerStore((s) => s.status);
	const setEmbedId = usePlayerStore((s) => s.setEmbedId);
	const shouldStartFromBeginning = usePlayerStore(
		(s) => s.interface.shouldStartFromBeginning,
	);
	const setShouldStartFromBeginning = usePlayerStore(
		(s) => s.setShouldStartFromBeginning,
	);
	const reset = usePlayerStore((s) => s.reset);
	const meta = usePlayerStore((s) => s.meta);
	const { init } = useInitializePlayer();
	// ponytail: whole-store subscription re-rendered this on every progress tick.
	// Only `.items` is read (via getProgress below).
	const progressItems = useProgressStore((s) => s.items);

	return {
		meta,
		reset,
		status,
		shouldStartFromBeginning,
		setShouldStartFromBeginning,
		setStatus,
		setMeta(m: PlayerMeta, newStatus?: PlayerStatus) {
			setMeta(m, newStatus);
		},
		playMedia(
			source: SourceSliceSource,
			captions: CaptionListItem[],
			sourceId: string | null,
			startAtOverride?: number,
			languageStreams?: LanguageStream[],
			currentStreamLanguage?: string | null,
		) {
			const start = startAtOverride ?? getProgress(progressItems, meta);
			setCaption(null);
			setEmbedId(null);
			setSource(
				source,
				captions,
				start,
				languageStreams,
				currentStreamLanguage,
			);
			setSourceId(sourceId);
			setStatus(playerStatus.PLAYING);
			init();
		},
		setScrapeStatus() {
			setStatus(playerStatus.SCRAPING);
		},
		setScrapeNotFound() {
			setStatus(playerStatus.SCRAPE_NOT_FOUND);
		},
	};
}
