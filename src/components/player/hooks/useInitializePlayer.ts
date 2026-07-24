import { useCallback, useEffect, useMemo } from "react";

import { usePlayerStore } from "@/stores/player/store";
import { useVolumeStore } from "@/stores/volume";

import { useCaptions } from "./useCaptions";

export function useInitializePlayer() {
	const display = usePlayerStore((s) => s.display);
	const volume = useVolumeStore((s) => s.volume);

	const init = useCallback(() => {
		display?.setVolume(volume);
	}, [display, volume]);

	return {
		init,
	};
}

export function useInitializeSource() {
	const source = usePlayerStore((s) => s.source);
	const sourceIdentifier = useMemo(
		// ponytail: stringify on every source change is overkill - the only consumer
		// just keys language selection off "did the source change". URL is unique-enough.
		() => (source ? (source.type === "hls" ? source.url : "file") : null),
		[source],
	);
	const { selectLastUsedLanguageIfEnabled } = useCaptions();

	useEffect(() => {
		if (sourceIdentifier) {
			selectLastUsedLanguageIfEnabled();
		}
	}, [sourceIdentifier, selectLastUsedLanguageIfEnabled]);
}
