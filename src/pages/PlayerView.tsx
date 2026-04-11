import type { RunOutput, Stream } from "@p-stream/providers";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAsync } from "react-use";

import type { DetailedMeta } from "@/backend/metadata/getmeta";
import { getProviders } from "@/backend/providers/providers";
import { usePlayer } from "@/components/player/hooks/usePlayer";
import { usePlayerMeta } from "@/components/player/hooks/usePlayerMeta";
import { convertProviderCaption } from "@/components/player/utils/captions";
import {
  convertStreamToSource,
  convertStreamsToLanguageStreams,
} from "@/components/player/utils/convertRunoutputToSource";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import type { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { useQueryParam } from "@/hooks/useQueryParams";
import { MetaPart } from "@/pages/parts/player/MetaPart";
import { PlaybackErrorPart } from "@/pages/parts/player/PlaybackErrorPart";
import { PlayerPart } from "@/pages/parts/player/PlayerPart";
import { ResumePart } from "@/pages/parts/player/ResumePart";
import { ScrapeErrorPart } from "@/pages/parts/player/ScrapeErrorPart";
import { ScrapingPart } from "@/pages/parts/player/ScrapingPart";
import { SourceSelectPart } from "@/pages/parts/player/SourceSelectPart";
import { useLastNonPlayerLink } from "@/stores/history";
import { playerStatus } from "@/stores/player/slices/source";
import type { PlayerMeta } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { getProgressPercentage, useProgressStore } from "@/stores/progress";
import { needsOnboarding } from "@/utils/onboarding";
import { parseTimestamp } from "@/utils/timestamp";

import { BlurEllipsis } from "./layouts/SubPageLayout";

function getProviderStreams(out: RunOutput): Stream[] {
  const maybeOut = out as unknown as {
    stream?: Stream | Stream[];
    streams?: Stream[];
  };

  if (Array.isArray(maybeOut.stream)) return maybeOut.stream;
  if (Array.isArray(maybeOut.streams)) return maybeOut.streams;
  if (maybeOut.stream) return [maybeOut.stream];
  return [];
}

function getStreamLanguage(stream: Stream): string | null {
  return (stream as Stream & { language?: string }).language ?? null;
}

export function RealPlayerView() {
  const navigate = useNavigate();
  const params = useParams<{
    media: string;
    episode?: string;
    season?: string;
  }>();
  const [errorData, setErrorData] = useState<{
    sources: Record<string, ScrapingSegment>;
    sourceOrder: ScrapingItems[];
  } | null>(null);
  const [resumeFromSourceId, setResumeFromSourceId] = useState<string | null>(
    null,
  );
  const storeResumeFromSourceId = usePlayerStore((s) => s.resumeFromSourceId);
  const setResumeFromSourceIdInStore = usePlayerStore(
    (s) => s.setResumeFromSourceId,
  );
  const [startAtParam] = useQueryParam("t");
  const {
    status,
    playMedia,
    reset,
    setScrapeNotFound,
    shouldStartFromBeginning,
    setShouldStartFromBeginning,
    setStatus,
  } = usePlayer();
  const sourceId = usePlayerStore((s) => s.sourceId);
  const { setPlayerMeta, scrapeMedia } = usePlayerMeta();
  const backUrl = useLastNonPlayerLink();
  const manualSourceSelection = usePreferencesStore(
    (s) => s.manualSourceSelection,
  );
  const setLastSuccessfulSource = usePreferencesStore(
    (s) => s.setLastSuccessfulSource,
  );
  const router = useOverlayRouter("settings");
  const openedWatchPartyRef = useRef<boolean>(false);
  const tracedScrapeKeysRef = useRef<Set<string>>(new Set());
  const progressItems = useProgressStore((s) => s.items);
  const routeParamsKey = `${params.media ?? ""}:${params.season ?? ""}:${params.episode ?? ""}`;

  // Reset last successful source when leaving the player
  useEffect(() => {
    return () => {
      setLastSuccessfulSource(null);
    };
  }, [setLastSuccessfulSource]);

  // Reset resume from source ID when leaving the player
  useEffect(() => {
    return () => {
      setResumeFromSourceId(null);
      setResumeFromSourceIdInStore(null);
    };
  }, [setResumeFromSourceIdInStore]);

  useEffect(() => {
    void routeParamsKey;
    reset();
    openedWatchPartyRef.current = false;
    return () => {
      reset();
    };
  }, [routeParamsKey, reset]);

  // Auto-open watch party menu if URL contains watchparty parameter
  useEffect(() => {
    if (openedWatchPartyRef.current) return;

    if (status === playerStatus.PLAYING) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("watchparty")) {
        setTimeout(() => {
          router.navigate("/watchparty");
          openedWatchPartyRef.current = true;
        }, 1000);
      }
    }
  }, [status, router]);

  const metaChange = useCallback(
    (meta: PlayerMeta) => {
      if (meta?.type === "show")
        navigate(
          `/media/${params.media}/${meta.season?.tmdbId}/${meta.episode?.tmdbId}`,
        );
      else navigate(`/media/${params.media}`);
    },
    [navigate, params],
  );

  // Check if episode is more than 80% watched
  const shouldShowResumeScreen = useCallback(
    (meta: PlayerMeta) => {
      if (!meta?.tmdbId) return false;

      const item = progressItems[meta.tmdbId];
      if (!item) return false;

      if (meta.type === "movie") {
        if (!item.progress) return false;
        const percentage = getProgressPercentage(
          item.progress.watched,
          item.progress.duration,
        );
        return percentage > 80;
      }

      if (meta.type === "show" && meta.episode?.tmdbId) {
        const episode = item.episodes?.[meta.episode.tmdbId];
        if (!episode) return false;
        const percentage = getProgressPercentage(
          episode.progress.watched,
          episode.progress.duration,
        );
        return percentage > 80;
      }

      return false;
    },
    [progressItems],
  );

  const handleMetaReceived = useCallback(
    (detailedMeta: DetailedMeta, episodeId?: string) => {
      const playerMeta = setPlayerMeta(detailedMeta, episodeId);
      if (playerMeta && shouldShowResumeScreen(playerMeta)) {
        setStatus(playerStatus.RESUME);
      }
    },
    [shouldShowResumeScreen, setStatus, setPlayerMeta],
  );

  const handleResume = useCallback(() => {
    setStatus(playerStatus.SCRAPING);
  }, [setStatus]);

  const handleRestart = useCallback(() => {
    setShouldStartFromBeginning(true);
    setStatus(playerStatus.SCRAPING);
  }, [setShouldStartFromBeginning, setStatus]);

  const handleResumeScraping = useCallback(
    (startFromSourceId: string) => {
      // Set resume source first
      setResumeFromSourceId(startFromSourceId);
      setResumeFromSourceIdInStore(startFromSourceId);
      // Then change status in next tick to ensure re-render
      setTimeout(() => {
        setStatus(playerStatus.SCRAPING);
      }, 0);
    },
    [setStatus, setResumeFromSourceIdInStore],
  );

  // Sync store value to local state when it changes (e.g., from settings)
  // or when status changes to SCRAPING
  useEffect(() => {
    if (storeResumeFromSourceId && status === playerStatus.SCRAPING) {
      if (
        !resumeFromSourceId ||
        resumeFromSourceId !== storeResumeFromSourceId
      ) {
        setResumeFromSourceId(storeResumeFromSourceId);
      }
    }
  }, [storeResumeFromSourceId, resumeFromSourceId, status]);

  const playAfterScrape = useCallback(
    async (out: RunOutput | null) => {
      if (!out) return;

      let streams = getProviderStreams(out);

      // Autoplay/runAll may return only a single chosen stream even when the
      // source scraper can provide multiple language variants. Hydrate variants
      // with a direct source scrape when possible.
      if (streams.length <= 1 && out.sourceId && scrapeMedia) {
        try {
          const sourceResult = await getProviders().runSourceScraper({
            id: out.sourceId,
            media: scrapeMedia,
          });
          if (sourceResult.stream && sourceResult.stream.length > 0) {
            streams = sourceResult.stream;
          }
        } catch {
          // Keep existing autoplay stream when source re-scrape fails.
        }
      }

      const primaryStream = streams[0];
      if (!primaryStream) return;

      const traceKey = `${out.sourceId ?? "unknown-source"}:${streams
        .map((stream) => `${stream.id}:${getStreamLanguage(stream) ?? "no-language"}`)
        .join("|")}`;
      if (!tracedScrapeKeysRef.current.has(traceKey)) {
        tracedScrapeKeysRef.current.add(traceKey);
        console.debug("[PlayerView] autoplay scrape streams", {
          sourceId: out.sourceId,
          streamCount: streams.length,
          streams: streams.map((stream) => ({
            id: stream.id,
            type: stream.type,
            language: getStreamLanguage(stream),
          })),
        });
      }

      let startAt: number | undefined;
      if (startAtParam) startAt = parseTimestamp(startAtParam) ?? undefined;

      // Clear failed sources and embeds when we successfully find a working source
      const playerStore = usePlayerStore.getState();
      playerStore.clearFailedSources();
      playerStore.clearFailedEmbeds();

      playMedia(
        convertStreamToSource(primaryStream),
        convertProviderCaption(primaryStream.captions, {
          ...primaryStream.preferredHeaders,
          ...primaryStream.headers,
        }),
        out.sourceId,
        shouldStartFromBeginning ? 0 : startAt,
        convertStreamsToLanguageStreams(streams),
        getStreamLanguage(primaryStream),
      );
      setShouldStartFromBeginning(false);
    },
    [
      playMedia,
      scrapeMedia,
      startAtParam,
      shouldStartFromBeginning,
      setShouldStartFromBeginning,
    ],
  );

  return (
    <PlayerPart backUrl={backUrl} onMetaChange={metaChange}>
      {status !== playerStatus.PLAYING ? <BlurEllipsis /> : null}
      {status === playerStatus.IDLE ? (
        <MetaPart onGetMeta={handleMetaReceived} />
      ) : null}
      {status === playerStatus.RESUME ? (
        <ResumePart
          onResume={handleResume}
          onRestart={handleRestart}
          onMetaChange={metaChange}
        />
      ) : null}
      {status === playerStatus.SCRAPING && scrapeMedia ? (
        manualSourceSelection ? (
          <SourceSelectPart media={scrapeMedia} />
        ) : (
          <ScrapingPart
            key={`scraping-${resumeFromSourceId || storeResumeFromSourceId || "default"}`}
            media={scrapeMedia}
            startFromSourceId={
              resumeFromSourceId || storeResumeFromSourceId || undefined
            }
            onResult={(sources, sourceOrder) => {
              setErrorData({
                sourceOrder,
                sources,
              });
              setScrapeNotFound();
              // Clear resume state after scraping
              setResumeFromSourceId(null);
              setResumeFromSourceIdInStore(null);
            }}
            onGetStream={playAfterScrape}
          />
        )
      ) : null}
      {status === playerStatus.SCRAPE_NOT_FOUND && errorData ? (
        <ScrapeErrorPart data={errorData} />
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? (
        <PlaybackErrorPart
          onResume={handleResumeScraping}
          currentSourceId={sourceId}
        />
      ) : null}
    </PlayerPart>
  );
}

export function PlayerView() {
  const loc = useLocation();
  const { loading, error, value } = useAsync(() => {
    return needsOnboarding();
  });

  if (error) throw new Error("Failed to detect onboarding");
  if (loading) return null;
  if (value)
    return (
      <Navigate
        replace
        to={{
          pathname: "/onboarding",
          search: `redirect=${encodeURIComponent(loc.pathname)}`,
        }}
      />
    );
  return <RealPlayerView />;
}

export default PlayerView;
