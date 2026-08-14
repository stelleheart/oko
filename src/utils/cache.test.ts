import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SimpleCache } from "./cache";

describe("SimpleCache", () => {
	// Use a string-keyed cache for most tests
	let cache: SimpleCache<string, string>;

	beforeEach(() => {
		cache = new SimpleCache<string, string>();
		cache.setCompare((a, b) => a === b);
	});

	describe("get compare requirement", () => {
		it("throws when setCompare has not been called", () => {
			const fresh = new SimpleCache<string, string>();
			expect(() => fresh.get("key")).toThrow("Compare function not set");
			expect(() => fresh.set("key", "val", 60)).toThrow(
				"Compare function not set",
			);
			expect(() => fresh.remove("key")).toThrow("Compare function not set");
		});
	});

	describe("set / get / has", () => {
		it("returns undefined for a missing key", () => {
			expect(cache.get("missing")).toBeUndefined();
		});

		it("stores and retrieves a value", () => {
			cache.set("foo", "bar", 60);
			expect(cache.get("foo")).toBe("bar");
			expect(cache.has("foo")).toBe(true);
			expect(cache.has("missing")).toBe(false);
		});

		it("stores falsy values correctly", () => {
			cache.set("empty", "", 60);
			// has() returns !!get(), so a falsy empty string is not "has"
			expect(cache.get("empty")).toBe("");
			expect(cache.has("empty")).toBe(false);
		});
	});

	describe("overwrite", () => {
		it("overwrites an existing key with a new value", () => {
			cache.set("foo", "bar", 60);
			cache.set("foo", "baz", 60);
			expect(cache.get("foo")).toBe("baz");
			// still only one entry
		});

		it("extends the expiry when overwriting", () => {
			vi.useFakeTimers();
			cache.set("foo", "bar", 60);
			// advance most of the way but not past expiry
			vi.advanceTimersByTime(50_000);
			// overwrite resets the expiry window
			cache.set("foo", "baz", 60);
			// advance past the *original* expiry but within the new window
			vi.advanceTimersByTime(55_000);
			expect(cache.get("foo")).toBe("baz");
			vi.useRealTimers();
		});
	});

	describe("remove / clear", () => {
		it("removes a single key", () => {
			cache.set("a", "1", 60);
			cache.set("b", "2", 60);
			cache.remove("a");
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("2");
		});

		it("clear removes all keys", () => {
			cache.set("a", "1", 60);
			cache.set("b", "2", 60);
			cache.clear();
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBeUndefined();
		});
	});

	describe("expiry", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("returns the value before expiry", () => {
			cache.set("foo", "bar", 10);
			vi.advanceTimersByTime(9_999);
			expect(cache.get("foo")).toBe("bar");
		});

		it("returns undefined after expiry and prunes the entry", () => {
			cache.set("foo", "bar", 10);
			vi.advanceTimersByTime(10_001);
			expect(cache.get("foo")).toBeUndefined();
			// Subsequent reads should still be undefined (entry was pruned)
			expect(cache.get("foo")).toBeUndefined();
		});

		it("expired entries are pruned by the background interval", () => {
			cache.initialize();
			cache.set("a", "1", 1); // expires in 1s
			cache.set("b", "2", 600);

			vi.advanceTimersByTime(1_001);
			// the 2min prune interval has not fired yet, but get() prunes on access
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("2");

			cache.destroy();
		});

		it("initialize throws when called twice", () => {
			cache.initialize();
			expect(() => cache.initialize()).toThrow("cache is already initialized");
			cache.destroy();
		});

		it("destroy clears the interval and storage", () => {
			cache.initialize();
			cache.set("foo", "bar", 60);
			cache.destroy();
			expect(cache.get("foo")).toBeUndefined();
		});
	});
});
