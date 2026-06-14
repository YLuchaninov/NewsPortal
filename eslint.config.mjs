import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import astro from "eslint-plugin-astro";
import globals from "globals";

const sourceGlobs = [
  "runtime/node/apps/**/*.{astro,ts,tsx}",
  "runtime/node/packages/**/*.ts",
  "runtime/node/services/**/*.{ts,tsx}",
  "infra/scripts/**/*.{js,mjs,ts}"
];

const tsGlobs = [
  "runtime/node/apps/**/*.{ts,tsx}",
  "runtime/node/packages/**/*.ts",
  "runtime/node/services/**/*.{ts,tsx}",
  "infra/scripts/**/*.ts"
];

const sharedGlobals = {
  ...globals.browser,
  ...globals.node
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "data/**",
      "coverage/**"
    ]
  },
  js.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: sourceGlobs,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals
    }
  },
  {
    files: tsGlobs,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: sharedGlobals
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unused-vars": "off"
    }
  }
];
