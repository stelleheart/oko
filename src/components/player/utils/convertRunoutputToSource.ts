import type { Stream } from "@p-stream/providers";

import type { LanguageStream } from "@/stores/player/slices/source";
import type {
  SourceFileStream,
  SourceQuality,
  SourceSliceSource,
} from "@/stores/player/utils/qualities";
import { convertProviderCaption } from "@/components/player/utils/captions";

const allowedQualitiesMap: Record<SourceQuality, SourceQuality> = {
  "4k": "4k",
  "1080": "1080",
  "480": "480",
  "360": "360",
  "720": "720",
  unknown: "unknown",
};
const allowedQualities = Object.keys(allowedQualitiesMap);
const allowedFileTypes = ["mp4"];

function isAllowedQuality(inp: string): inp is SourceQuality {
  return allowedQualities.includes(inp);
}

function getStreamLanguage(stream: Stream): string | null {
  return (stream as Stream & { language?: string }).language ?? null;
}

export function convertStreamToSource(stream: Stream): SourceSliceSource {
  if (stream.type === "hls") {
    return {
      type: "hls",
      url: stream.playlist,
      headers: stream.headers,
      preferredHeaders: stream.preferredHeaders,
    };
  }
  if (stream.type === "file") {
    const qualities: Partial<Record<SourceQuality, SourceFileStream>> = {};
    Object.entries(stream.qualities).forEach((entry) => {
      if (!isAllowedQuality(entry[0])) {
        console.warn(`unrecognized quality: ${entry[0]}`);
        return;
      }
      if (!allowedFileTypes.includes(entry[1].type)) {
        console.warn(`unrecognized file type: ${entry[1].type}`);
        return;
      }
      qualities[entry[0]] = {
        type: entry[1].type,
        url: entry[1].url,
      };
    });
    return {
      type: "file",
      qualities,
      headers: stream.headers,
      preferredHeaders: stream.preferredHeaders,
    };
  }
  throw new Error("unrecognized type");
}

export function convertRunoutputToSource(out: {
  stream: Stream;
}): SourceSliceSource {
  return convertStreamToSource(out.stream);
}

export function convertStreamsToLanguageStreams(
  streams: Stream[],
): LanguageStream[] {
  return streams.map((s) => ({
    language: getStreamLanguage(s),
    stream: convertStreamToSource(s),
    captions: convertProviderCaption(s.captions || [], {
      ...s.preferredHeaders,
      ...s.headers,
    }),
  }));
}
