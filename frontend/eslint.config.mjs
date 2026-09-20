import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pin the React version instead of "detect": the react plugin bundled by
    // eslint-config-next 16 calls a removed ESLint 10 API during detection
    // (context.getFilename is not a function), which crashes every lint run.
    settings: {
      react: { version: "19.2.8" },
    },
  },
  {
    rules: {
      // The flagged effects are intentional hydration-safe patterns: the
      // next-themes "mounted" flag and seeding edit forms once after fetch.
      // Surfaced until now only because the config above was crashing.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
