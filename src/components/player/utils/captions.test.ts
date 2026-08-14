import { describe, expect, it } from "vitest";

import {
  captionIsVisible,
  convertSubtitlesToSrt,
  convertSubtitlesToVtt,
  filterDuplicateCaptionCues,
  makeQueId,
  parseVttSubtitles,
} from "@/components/player/utils/captions";

// NOTE: captionIsVisible expects `start`/`end` in milliseconds (divided by 1000
// internally) and `delay`/`currentTime` in seconds. This mirrors how the player
// slice stores cue timings.
describe("captionIsVisible", () => {
  it("returns true when currentTime is within the delayed range", () => {
    // start=0ms end=10000ms delay=0s, currentTime=5s -> [0,10] contains 5
    expect(captionIsVisible(0, 10_000, 0, 5)).toBe(true);
  });

  it("returns false when currentTime is before the start", () => {
    expect(captionIsVisible(10_000, 20_000, 0, 5)).toBe(false);
  });

  it("returns false when currentTime is after the end", () => {
    expect(captionIsVisible(10_000, 20_000, 0, 25)).toBe(false);
  });

  it("applies the delay offset to both start and end", () => {
    // start=0ms end=10000ms delay=2s -> effective [2,12]
    expect(captionIsVisible(0, 10_000, 2, 5)).toBe(true);
    expect(captionIsVisible(0, 10_000, 2, 1)).toBe(false);
    expect(captionIsVisible(0, 10_000, 2, 13)).toBe(false);
  });

  it("clamps the lower bound to 0", () => {
    // delayedStart = -1 - 5000 = -5001 -> clamped to 0
    expect(captionIsVisible(-1_000, 1_000, -5_000, 0)).toBe(true);
  });

  it("returns true on the boundary and false just past it", () => {
    // start=10000ms end=10000ms -> [10,10]; 10 inclusive, 11 outside
    expect(captionIsVisible(10_000, 10_000, 0, 10)).toBe(true);
    expect(captionIsVisible(10_000, 10_000, 0, 11)).toBe(false);
  });
});

describe("makeQueId", () => {
  it("builds an id from index, start and end", () => {
    expect(makeQueId(2, 100, 200)).toBe("2-100-200");
  });

  it("differentiates cues by all three components", () => {
    expect(makeQueId(1, 0, 10)).not.toBe(makeQueId(1, 0, 20));
    expect(makeQueId(1, 0, 10)).not.toBe(makeQueId(2, 0, 10));
  });
});

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:02,000
Hello world

2
00:00:03,000 --> 00:00:04,000
Second line
`;

describe("convertSubtitlesToVtt", () => {
  it("converts a valid SRT to VTT", () => {
    const vtt = convertSubtitlesToVtt(SAMPLE_SRT);
    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("Hello world");
    expect(vtt).toContain(" --> ");
  });

  it("throws on empty input", () => {
    expect(() => convertSubtitlesToVtt("   ")).toThrow("Given text is empty");
  });

  it("throws on invalid subtitle format", () => {
    expect(() => convertSubtitlesToVtt("not a subtitle format at all")).toThrow();
  });
});

describe("convertSubtitlesToSrt", () => {
  it("converts valid SRT to SRT (round-trip)", () => {
    const srt = convertSubtitlesToSrt(SAMPLE_SRT);
    expect(srt).toContain("Hello world");
    expect(srt).toContain(" --> ");
  });

  it("throws on empty input", () => {
    expect(() => convertSubtitlesToSrt("")).toThrow("Given text is empty");
  });
});

describe("parseVttSubtitles", () => {
  it("parses VTT cues and filters to caption type", () => {
    const vtt = convertSubtitlesToVtt(SAMPLE_SRT);
    const cues = parseVttSubtitles(vtt);
    expect(cues.length).toBe(2);
    expect(cues[0].content).toContain("Hello world");
    expect(cues.every((c) => c.type === "caption")).toBe(true);
  });

  it("returns an empty array for empty VTT content", () => {
    expect(parseVttSubtitles("WEBVTT\n\n")).toEqual([]);
  });
});

describe("filterDuplicateCaptionCues", () => {
  it("removes consecutive duplicate cues", () => {
    const cues = [
      { start: 0, end: 1, content: "A" },
      { start: 0, end: 1, content: "A" },
      { start: 1, end: 2, content: "B" },
      { start: 1, end: 2, content: "B" },
      { start: 2, end: 3, content: "A" },
    ];
    const filtered = filterDuplicateCaptionCues(cues);
    expect(filtered.length).toBe(3);
    expect(filtered[0].content).toBe("A");
    expect(filtered[1].content).toBe("B");
    expect(filtered[2].content).toBe("A");
  });

  it("keeps non-consecutive duplicates", () => {
    const cues = [
      { start: 0, end: 1, content: "A" },
      { start: 1, end: 2, content: "B" },
      { start: 2, end: 3, content: "A" },
    ];
    expect(filterDuplicateCaptionCues(cues).length).toBe(3);
  });

  it("handles an empty array", () => {
    expect(filterDuplicateCaptionCues([])).toEqual([]);
  });
});
