module.exports = {
  // Keep ignore patterns similar to the project's ESLint ignorePatterns
  files: {
    ignores: [
      "public/*",
      "dist/*",
      "/*.js",
      "/*.ts",
      "/*.mts",
      "/plugins/*.ts",
      "/plugins/*.mjs",
      "/themes/**/*.ts",
    ],
  },
  // Minimal linter/formatter setup – Biome is opinionated; tune rules below if needed
  linter: {
    // You can add rule overrides here to align with existing ESLint choices.
    rules: {
      // Example: treat unused vars as warnings like the previous config
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
};
