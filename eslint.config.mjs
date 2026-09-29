import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // A leading underscore (`_params`) marks a parameter as intentionally
    // unused — mainly for interface implementations (fakes, adapters) that
    // must accept a value they don't read. Recognize the convention
    // instead of warning on it everywhere it's used.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated, untracked output (e.g. the brag-slim skill's launch-video
    // build) — never part of the app itself, shouldn't be linted as if it
    // were.
    "brag-output/**",
  ]),
]);

export default eslintConfig;
