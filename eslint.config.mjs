import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { react: { version: "19.3.0" } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Clients Prisma gerados
    "src/generated/**",
    // Configs .mjs usam o parser Babel do Next, incompatível com ESLint 10.
    "eslint.config.mjs",
    "postcss.config.mjs",
  ]),
]);

export default eslintConfig;
