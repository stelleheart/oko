import { afterEach, describe, expect, it, vi } from "vitest";

// Mutable config captured at module load via the mock below.
const mockConfig = vi.hoisted(() => ({
  PROXY_URLS: ["http://default-proxy:8080"],
  M3U8_PROXY_URLS: ["http://m3u8-proxy:8080"],
}));

const mockProxySet = vi.hoisted<{ value: string[] | null }>(() => ({
  value: null,
}));

vi.mock("@/setup/config", () => ({
  conf: () => ({
    PROXY_URLS: mockConfig.PROXY_URLS,
    M3U8_PROXY_URLS: mockConfig.M3U8_PROXY_URLS,
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: () => ({ proxySet: mockProxySet.value }),
  },
}));

import { getM3U8ProxyUrls, getParsedUrls, getProxyUrls } from "@/utils/proxyUrls";

describe("proxyUrls", () => {
  afterEach(() => {
    // reset proxySet override so tests don't leak state
    mockProxySet.value = null;
  });

  describe("getProxyUrls", () => {
    it("falls back to config PROXY_URLS when proxySet is null", () => {
      mockProxySet.value = null;
      expect(getProxyUrls()).toEqual(["http://default-proxy:8080"]);
    });

    it("does NOT fall back to config when proxySet is an empty array", () => {
      // [] is a non-nullish value, so ?? keeps it (no fallback to originalUrls)
      mockProxySet.value = [];
      expect(getProxyUrls()).toEqual([]);
    });

    it("returns the proxySet when set to a non-empty array", () => {
      mockProxySet.value = ["http://custom-proxy:9090"];
      expect(getProxyUrls()).toEqual(["http://custom-proxy:9090"]);
    });

    it("parses plain (non-pipe) proxy URLs", () => {
      mockProxySet.value = ["http://a:80", "http://b:90"];
      expect(getProxyUrls()).toEqual(["http://a:80", "http://b:90"]);
    });

    it("parses the pipe-delimited '|type=proxy|url' format", () => {
      mockProxySet.value = ["|type=proxy|http://c:80"];
      expect(getProxyUrls()).toEqual(["http://c:80"]);
    });

    it("parses pipe format with params but no type (defaults to proxy)", () => {
      mockProxySet.value = ["|foo=bar|http://d:80"];
      expect(getProxyUrls()).toEqual(["http://d:80"]);
    });

    it("skips invalid plain URLs", () => {
      mockProxySet.value = ["not-a-url", "http://valid:80"];
      expect(getProxyUrls()).toEqual(["http://valid:80"]);
    });

    it("skips pipe entries whose URL is invalid", () => {
      mockProxySet.value = ["|type=proxy|not-a-url", "http://valid:80"];
      expect(getProxyUrls()).toEqual(["http://valid:80"]);
    });

    it("skips pipe entries with an unknown type", () => {
      mockProxySet.value = ["|type=bogus|http://e:80"];
      expect(getProxyUrls()).toEqual([]);
    });

    it("mixes plain, pipe-typed and invalid entries", () => {
      mockProxySet.value = [
        "http://plain:1",
        "|type=proxy|http://pipe:2",
        "invalid",
        "|type=bogus|http://bad:3",
      ];
      expect(getProxyUrls()).toEqual(["http://plain:1", "http://pipe:2"]);
    });
  });

  describe("getParsedUrls", () => {
    it("returns typed objects preserving the proxy type", () => {
      mockProxySet.value = ["|type=proxy|http://f:80"];
      const parsed = getParsedUrls();
      expect(parsed).toEqual([{ url: "http://f:80", type: "proxy" }]);
    });
  });

  describe("getM3U8ProxyUrls", () => {
    it("returns the configured M3U8 proxy URLs", () => {
      expect(getM3U8ProxyUrls()).toEqual(["http://m3u8-proxy:8080"]);
    });
  });
});
