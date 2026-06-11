// Flat ESLint config for the Agent Room extension.
// Lints TypeScript sources and tests; webview client JS (media/) is plain
// browser script and is checked by review + manual testing instead.
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["out/**", "node_modules/**", "media/**", "*.js"]
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-console": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "multi-line"]
    }
  }
);
