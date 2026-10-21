// The app and the design system: React's hooks and the compiler's rules, nothing from data into the
// DOM as HTML (docs/ARCHITECTURE.md, "React" and the security checklist); ui imports only itself and
// draws no raw link. A part of the lint config, which eslint.config.ts composes.
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import { SWALLOWED, TESTS } from "./shared.config.ts";

const MEMOS = ["memo", "useMemo", "useCallback"];
const MEMO = "The React Compiler memoizes: no hand-written memo, useMemo or useCallback (docs/ARCHITECTURE.md).";
const HTML = "Nothing reaches the DOM as HTML: render it as React elements (docs/ARCHITECTURE.md, security).";
// Shared with the app's folders, whose own no-restricted-properties replaces these there.
export const REACT_PROPERTIES = [
  ...MEMOS.map((property) => ({ object: "React", property, message: MEMO })),
  ...["innerHTML", "outerHTML", "insertAdjacentHTML"].map((property) => ({ property, message: HTML })),
  { object: "document", property: "write", message: HTML },
];
// A link drawn in JSX or by createElement, or a form, which navigates too (F360).
const RAW_ANCHOR = {
  selector:
    "JSXOpeningElement[name.name=/^(a|form)$/], CallExpression[callee.name='createElement'][arguments.0.value='a'], CallExpression[callee.property.name='createElement'][arguments.0.value='a']",
  message: "A link in ui is an Anchor, and a form the page's (F259).",
};

export default defineConfig(
  {
    // Their warnings fail too.
    files: ["app/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], eslintReact.configs["strict-type-checked"]],
    rules: {
      // A route answers "not found" by throwing React Router's data(); nothing else but an Error.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "react-router", name: "DataWithResponseInit" }] },
      ],
      "no-restricted-imports": ["error", { name: "react", importNames: MEMOS, message: MEMO }],
      "no-restricted-properties": ["error", ...REACT_PROPERTIES],
    },
  },
  // React Router calls the server entry with four arguments; it runs only at build time.
  { files: ["app/src/entry.server.tsx"], rules: { "max-params": ["error", 4] } },
  {
    // ui: the design system imports only itself and its packages, never the app, core or a config.
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages/ui",
              from: "./",
              except: ["./packages/ui", "./node_modules"],
              message: "ui imports only ui (docs/ARCHITECTURE.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // A link in ui is an Anchor (link.tsx), so the site's own paths go through the page's link and
    // never reload the app (F259, F317). Its stories, its tests and the overview's prose draw plain ones.
    files: ["packages/ui/src/**/*.tsx"],
    ignores: ["packages/ui/src/link.tsx", "packages/ui/src/Overview/**", "**/*.stories.tsx", ...TESTS],
    rules: { "no-restricted-syntax": ["error", ...SWALLOWED, RAW_ANCHOR] },
  },
);
