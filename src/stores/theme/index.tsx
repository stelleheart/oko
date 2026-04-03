import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import {
  parts,
  primaryOptions,
  secondaryOptions,
  tertiaryOptions,
} from "@themes/custom";

function hexToRgbString(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export interface SavedCustomTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
  customPrimaryHex?: string;
  customSecondaryHex?: string;
  customTertiaryHex?: string;
}

export interface ThemeStore {
  theme: string | null;
  customTheme: {
    // kept for backwards compat or default 'custom'
    primary: string;
    secondary: string;
    tertiary: string;
  };
  savedCustomThemes: SavedCustomTheme[];
  hiddenDefaultThemes: string[];
  setTheme(v: string | null): void;
  setCustomTheme(v: {
    primary: string;
    secondary: string;
    tertiary: string;
  }): void;
  saveCustomTheme(v: SavedCustomTheme): void;
  deleteCustomTheme(id: string): void;
  hideDefaultTheme(id: string): void;
}

const currentDate = new Date();
const is420 = currentDate.getMonth() + 1 === 4 && currentDate.getDate() === 20;
const isHalloween =
  currentDate.getMonth() + 1 === 10 && currentDate.getDate() === 31;
const defaultTheme = is420 ? "green" : isHalloween ? "autumn" : "forest";

export const useThemeStore = create(
  persist(
    immer<ThemeStore>((set) => ({
      theme: defaultTheme,
      customTheme: {
        primary: "classic",
        secondary: "classic",
        tertiary: "classic",
      },
      savedCustomThemes: [],
      hiddenDefaultThemes: [],
      setTheme(v) {
        set((s) => {
          s.theme = v;
        });
      },
      setCustomTheme(v) {
        set((s) => {
          s.customTheme = v;
        });
      },
      saveCustomTheme(v) {
        set((s) => {
          const existing = s.savedCustomThemes.findIndex((t) => t.id === v.id);
          if (existing !== -1) s.savedCustomThemes[existing] = v;
          else s.savedCustomThemes.push(v);
        });
      },
      deleteCustomTheme(id) {
        set((s) => {
          s.savedCustomThemes = s.savedCustomThemes.filter((t) => t.id !== id);
          if (s.theme === id) {
            s.theme = null; // reset to default if deleted theme was active
          }
        });
      },
      hideDefaultTheme(id) {
        set((s) => {
          if (!s.hiddenDefaultThemes.includes(id)) {
            s.hiddenDefaultThemes.push(id);
          }
          if (s.theme === id) {
            s.theme = null;
          }
        });
      },
    })),
    {
      name: "__MW::theme",
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<ThemeStore>;
        return {
          ...state,
          theme: state.theme ?? defaultTheme,
        };
      },
    },
  ),
);

export interface PreviewThemeStore {
  previewTheme: string | null;
  previewSavedCustomThemes: SavedCustomTheme[] | null;
  setPreviewTheme(v: string | null): void;
  setPreviewSavedCustomThemes(v: SavedCustomTheme[] | null): void;
}

export const usePreviewThemeStore = create(
  immer<PreviewThemeStore>((set) => ({
    previewTheme: null,
    previewSavedCustomThemes: null,
    setPreviewTheme(v) {
      set((s) => {
        s.previewTheme = v;
      });
    },
    setPreviewSavedCustomThemes(v) {
      set((s) => {
        s.previewSavedCustomThemes = v;
      });
    },
  })),
);

export function ThemeProvider(props: {
  children?: ReactNode;
  applyGlobal?: boolean;
}) {
  const previewTheme = usePreviewThemeStore((s) => s.previewTheme);
  const previewSavedCustomThemes = usePreviewThemeStore(
    (s) => s.previewSavedCustomThemes,
  );
  const theme = useThemeStore((s) => s.theme);
  const customTheme = useThemeStore((s) => s.customTheme);

  const savedCustomThemesStore = useThemeStore((s) => s.savedCustomThemes);
  const savedCustomThemes = previewSavedCustomThemes ?? savedCustomThemesStore;

  const themeToDisplay = previewTheme ?? theme;
  const themeSelector = themeToDisplay ? `theme-${themeToDisplay}` : undefined;

  let styleContent = "";
  if (themeToDisplay === "custom" && customTheme) {
    const primary =
      primaryOptions.find((o) => o.id === customTheme.primary)?.colors || {};
    const secondary =
      secondaryOptions.find((o) => o.id === customTheme.secondary)?.colors ||
      {};
    const tertiary =
      tertiaryOptions.find((o) => o.id === customTheme.tertiary)?.colors || {};

    const vars = { ...primary, ...secondary, ...tertiary };
    const cssVars = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");

    styleContent += `.theme-custom { ${cssVars} }\n`;
  }

  // Inject CSS rules for all saved custom themes so their previews render correctly
  savedCustomThemes.forEach((savedTheme) => {
    const primary =
      primaryOptions.find((o) => o.id === savedTheme.primary)?.colors || {};
    const secondary =
      secondaryOptions.find((o) => o.id === savedTheme.secondary)?.colors || {};
    const tertiary =
      tertiaryOptions.find((o) => o.id === savedTheme.tertiary)?.colors || {};

    const vars: Record<string, string> = {
      ...primary,
      ...secondary,
      ...tertiary,
    };

    // Override with custom hex colors when set
    if (savedTheme.customPrimaryHex) {
      const rgb = hexToRgbString(savedTheme.customPrimaryHex);
      parts.primary.forEach((key) => {
        vars[`--colors-${key.replace(/\./g, "-")}`] = rgb;
      });
    }
    if (savedTheme.customSecondaryHex) {
      const rgb = hexToRgbString(savedTheme.customSecondaryHex);
      parts.secondary.forEach((key) => {
        vars[`--colors-${key.replace(/\./g, "-")}`] = rgb;
      });
    }
    if (savedTheme.customTertiaryHex) {
      const rgb = hexToRgbString(savedTheme.customTertiaryHex);
      parts.tertiary.forEach((key) => {
        vars[`--colors-${key.replace(/\./g, "-")}`] = rgb;
      });
    }

    const cssVars = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");

    const safeId = savedTheme.id.replace(/[^a-zA-Z0-9-]/g, "");
    styleContent += `.theme-${safeId} { ${cssVars} }\n`;
  });

  return (
    <div className={themeSelector}>
      {styleContent ? (
        <Helmet>
          <style>{styleContent}</style>
        </Helmet>
      ) : null}
      {props.applyGlobal ? (
        <Helmet>
          <body className={themeSelector} />
        </Helmet>
      ) : null}
      {props.children}
    </div>
  );
}
