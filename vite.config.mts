import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import loadVersion from "vite-plugin-package-version";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import path from "path";
import { type PluginOption, loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

import tailwind from "tailwindcss";
import rtl from "postcss-rtlcss";

const captioningPackages = [
  "dompurify",
  "htmlparser2",
  "subsrt-ts",
  "parse5",
  "entities",
  "fuse",
];

function getVar(vars: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    return acc != null && typeof acc === "object"
      ? (acc as Record<string, unknown>)[k]
      : undefined;
  }, vars);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyTemplate(html: string, vars: Record<string, unknown>): string {
  html = html.replace(
    /\{\{#if\s+([^\s}]+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, path, truthy, falsy) => {
      const v = getVar(vars, path);
      return v ? truthy : (falsy || "");
    },
  );
  html = html.replace(/\{\{\{([^}]+?)\}\}\}/g, (_, path) => {
    const v = getVar(vars, path.trim());
    return v == null ? "" : String(v);
  });
  html = html.replace(/\{\{([^#/{][^}]*?)\}\}/g, (_, path) => {
    const v = getVar(vars, path.trim());
    if (v == null) return "";
    return escapeHtml(String(v));
  });
  return html;
}

const OPENSEARCH_XML_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>oko</ShortName>
  <Description>The place for your favorite movies &amp; shows</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" template="{{ routeDomain }}/browse/?q={searchTerms}" />
</OpenSearchDescription>
`;

function indexHtmlTransform(env: Record<string, string>): PluginOption {
  const routeDomain =
    env.VITE_APP_DOMAIN + (env.VITE_NORMAL_ROUTER !== "true" ? "/#" : "");
  const opensearchEnabled = env.VITE_OPENSEARCH_ENABLED === "true";
  const vars: Record<string, unknown> = {
    opensearchEnabled,
    routeDomain,
    env,
  };
  return {
    name: "index-html-transform",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return applyTemplate(html, vars);
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "opensearch.xml",
        source: applyTemplate(OPENSEARCH_XML_TEMPLATE, vars),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    base: env.VITE_BASE_URL || "/",
    plugins: [
      indexHtmlTransform(env),
      react({
        babel: {
          presets: [
            "@babel/preset-typescript",
            [
              "@babel/preset-env",
              {
                modules: false,
                useBuiltIns: "entry",
                corejs: {
                  version: "3.34",
                },
              },
            ],
          ],
        },
      }),
      VitePWA({
        disable: env.VITE_PWA_ENABLED !== "true",
        registerType: "autoUpdate",

        workbox: {
          maximumFileSizeToCacheInBytes: 4000000, // 4mb
          globIgnores: ["!assets/**/*"],
        },
        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "safari-pinned-tab.svg",
        ],
        manifest: {
          name: "oko",
          short_name: "oko",
          description:
            "Watch your favorite shows and movies for free with no ads ever! (っ'ヮ'c)",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
      loadVersion(),
      checker({
        overlay: {
          position: "tr",
        },
        typescript: true, // check typescript build errors in dev server
      }),
      visualizer() as PluginOption,
    ],

    build: {
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (
              id.includes("@sozialhelden+ietf-language-tags") ||
              id.includes("country-language")
            ) {
              return "language-db";
            }
            if (id.includes("hls.js")) {
              return "hls";
            }
            if (id.includes("locales") && !id.includes("en.json")) {
              return "locales";
            }
            if (id.includes("react-dom")) {
              return "react-dom";
            }
            if (id.includes("Icon.tsx")) {
              return "Icons";
            }
            const isCaptioningPackage = captioningPackages.some((packageName) =>
              id.includes(packageName),
            );
            if (isCaptioningPackage) {
              return "caption-parsing";
            }
          },
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwind(), rtl()],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@themes": path.resolve(__dirname, "./themes"),
        "@sozialhelden/ietf-language-tags": path.resolve(
          __dirname,
          "./node_modules/@sozialhelden/ietf-language-tags/dist/cjs",
        ),
      },
    },

    test: {
      environment: "jsdom",
    },
    preview: {
      host: true,
      port: 80,
      allowedHosts: ["pstream.net", "pstream-test.vercel.app"],
    },
  };
});
