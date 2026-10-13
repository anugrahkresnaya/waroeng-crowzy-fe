import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The engine must stay framework-free and deterministic so runs can be replayed headless.
  {
    files: ["engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*"] },
      ],
      "no-restricted-globals": [
        "error",
        "window", "document", "navigator", "localStorage", "sessionStorage", "indexedDB",
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng from engine/rng.ts." },
        { object: "Date", property: "now", message: "Use the game clock, not wall time." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Use the game clock, not wall time." },
      ],
    },
  },
]);

export default eslintConfig;
