import { describe, expect, it } from "vitest";

import {
	type CustomThemeSettings,
	resolveCustomTheme,
} from "@/backend/accounts/settings";

describe("resolveCustomTheme", () => {
	it("returns null when customTheme is undefined", () => {
		expect(resolveCustomTheme(undefined)).toBeNull();
	});

	it("returns null when no resolvable theme is present", () => {
		expect(resolveCustomTheme({})).toBeNull();
		expect(
			resolveCustomTheme({ primary: "one" } as CustomThemeSettings),
		).toBeNull();
		expect(
			resolveCustomTheme({
				primary: "one",
				secondary: "two",
			} as CustomThemeSettings),
		).toBeNull();
	});

	it("prefers the activeTheme object when present", () => {
		const activeTheme = { primary: "a", secondary: "b", tertiary: "c" };
		const result = resolveCustomTheme({
			primary: "legacy-p",
			activeTheme,
		});
		expect(result).toBe(activeTheme);
		expect(result).toEqual({ primary: "a", secondary: "b", tertiary: "c" });
	});

	it("falls back to the legacy primary/secondary/tertiary triple", () => {
		expect(
			resolveCustomTheme({
				primary: "p",
				secondary: "s",
				tertiary: "t",
			}),
		).toEqual({ primary: "p", secondary: "s", tertiary: "t" });
	});

	it("does not return the legacy fallback when not all three are present", () => {
		expect(
			resolveCustomTheme({ primary: "p", secondary: "s", tertiary: "" }),
		).toBeNull();
	});
});
