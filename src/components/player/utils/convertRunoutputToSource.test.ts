import type { Stream } from "@p-stream/providers";
import { describe, expect, it } from "vitest";
import {
	convertRunoutputToSource,
	convertStreamsToLanguageStreams,
	convertStreamToSource,
} from "@/components/player/utils/convertRunoutputToSource";
import type { SourceSliceSource } from "@/stores/player/utils/qualities";

// The provider Stream type carries extra bookkeeping fields (id, flags, ...)
// that are irrelevant to source conversion; cast through `unknown` for test
// fixtures.
function asStream(shape: object): Stream {
	return shape as unknown as Stream;
}

function asFileSource(result: SourceSliceSource) {
	return result as Extract<SourceSliceSource, { type: "file" }>;
}

describe("convertStreamToSource", () => {
	it("converts an HLS stream to the player source shape", () => {
		const stream = asStream({
			type: "hls",
			playlist: "https://example.com/stream.m3u8",
			headers: { Authorization: "Bearer abc" },
			preferredHeaders: { "User-Agent": "test" },
			captions: [],
		});

		const result = convertStreamToSource(stream);

		expect(result).toEqual({
			type: "hls",
			url: "https://example.com/stream.m3u8",
			headers: { Authorization: "Bearer abc" },
			preferredHeaders: { "User-Agent": "test" },
		});
	});

	it("converts an mp4 file stream, mapping allowed qualities", () => {
		const stream = asStream({
			type: "file",
			qualities: {
				"1080": { type: "mp4", url: "https://example.com/1080.mp4" },
				"720": { type: "mp4", url: "https://example.com/720.mp4" },
				"360": { type: "mp4", url: "https://example.com/360.mp4" },
			},
			headers: {},
			preferredHeaders: {},
			captions: [],
		});

		const result = convertStreamToSource(stream);

		expect(result.type).toBe("file");
		const file = asFileSource(result);
		expect(file.qualities["1080"]).toEqual({
			type: "mp4",
			url: "https://example.com/1080.mp4",
		});
		expect(file.qualities["720"]).toEqual({
			type: "mp4",
			url: "https://example.com/720.mp4",
		});
		expect(file.qualities).toHaveProperty("360");
	});

	it("drops qualities that are not in the allowed list", () => {
		const stream = asStream({
			type: "file",
			qualities: {
				"1080": { type: "mp4", url: "https://example.com/1080.mp4" },
				"999": { type: "mp4", url: "https://example.com/999.mp4" },
			},
			headers: {},
			preferredHeaders: {},
			captions: [],
		});

		const result = convertStreamToSource(stream);

		expect(result.type).toBe("file");
		const file = asFileSource(result);
		expect(file.qualities["1080"]).toBeDefined();
		expect((file.qualities as Record<string, unknown>)["999"]).toBeUndefined();
	});

	it("drops qualities whose file type is not mp4", () => {
		const stream = asStream({
			type: "file",
			qualities: {
				"1080": { type: "webm", url: "https://example.com/1080.webm" },
			},
			headers: {},
			preferredHeaders: {},
			captions: [],
		});

		const result = convertStreamToSource(stream);

		expect(result.type).toBe("file");
		const file = asFileSource(result);
		expect(file.qualities["1080"]).toBeUndefined();
	});

	it("throws on an unrecognized stream type", () => {
		const stream = asStream({
			type: "something-else",
			headers: {},
			preferredHeaders: {},
			captions: [],
		});

		expect(() => convertStreamToSource(stream)).toThrow("unrecognized type");
	});
});

describe("convertRunoutputToSource", () => {
	it("delegates to convertStreamToSource", () => {
		const stream = asStream({
			type: "hls",
			playlist: "https://example.com/playlist.m3u8",
			headers: {},
			preferredHeaders: {},
			captions: [],
		});

		const result = convertRunoutputToSource({ stream });

		expect(result).toEqual({
			type: "hls",
			url: "https://example.com/playlist.m3u8",
			headers: {},
			preferredHeaders: {},
		});
	});
});

describe("convertStreamsToLanguageStreams", () => {
	it("maps each stream to a language stream with captions", () => {
		const streamA = asStream({
			type: "hls",
			playlist: "https://example.com/a.m3u8",
			headers: {},
			preferredHeaders: {},
			captions: [],
			language: "en",
		});
		const streamB = asStream({
			type: "file",
			qualities: {
				"720": { type: "mp4", url: "https://example.com/b_720.mp4" },
			},
			headers: { "X-Token": "t" },
			preferredHeaders: {},
			captions: [
				{
					id: "cap-1",
					language: "es",
					url: "https://example.com/sub.es.vtt",
					hasCorsRestrictions: false,
					opensubtitles: false,
				},
			],
		});

		const result = convertStreamsToLanguageStreams([streamA, streamB]);

		expect(result.length).toBe(2);
		expect(result[0].language).toBe("en");
		expect(result[0].stream.type).toBe("hls");
		expect(result[1].language).toBeNull();
		expect(result[1].stream.type).toBe("file");
		expect(result[1].captions.length).toBe(1);
		expect(result[1].captions[0]).toMatchObject({
			id: "cap-1",
			language: "es",
			url: "https://example.com/sub.es.vtt",
			needsProxy: false,
			opensubtitles: false,
		});
		// requestHeaders merged from preferredHeaders + headers
		expect(result[1].captions[0].requestHeaders).toEqual({ "X-Token": "t" });
	});

	it("handles streams without a language field", () => {
		const stream = asStream({
			type: "hls",
			playlist: "https://example.com/x.m3u8",
			headers: {},
			preferredHeaders: {},
			captions: [],
		});
		const result = convertStreamsToLanguageStreams([stream]);
		expect(result[0].language).toBeNull();
	});

	it("produces an empty array for no streams", () => {
		expect(convertStreamsToLanguageStreams([])).toEqual([]);
	});
});
