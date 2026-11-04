// The chain-read package (D112): the boundary every chain read crosses, for the app, the server and Jarvis. It imports core,
// Zod and the schemas alone, never a workspace that imports it nor the service package, tests included; its code runs in the
// browser too, so no React, design system, store or Node module, and console nowhere. And no module outside it holds a read's
// words, however written (gnoworld/chain-read, D113). A part of the lint config, which eslint.config.ts composes.
import type { Rule } from "eslint";
import { defineConfig } from "eslint/config";
import { BENCHES, TESTS } from "./shared.config.ts";

const CHAIN =
  "The chain package reads with core, Zod and the schemas: never React, the design system, the store, Node or a workspace that imports it (D112).";
const APART = { regex: "^@gnoworld/(server|jarvis|app|service)(/|$)", message: CHAIN };

// A read's words (D113): what a request to a chain's node or the indexer says, which the chain package alone may write. A
// node's bare address is configuration, which reaches nothing alone; a route of our own ("/status") names no address.
const WORDS: readonly (readonly [string, RegExp])[] = [
  ["an ABCI query", /abci_(?:query|info)/],
  ["an ABCI path", /\bvm\/q|\b(?:auth\/accounts|bank\/balances)\//],
  [
    "a node's RPC route after its address",
    /(?:\$\{\}|:\/\/[^/?#\s]+)\/(?:status|block|block_results|blockchain|commit|validators|genesis|net_info|health|tx|tx_search|broadcast_tx_(?:async|sync|commit)|unconfirmed_txs|num_unconfirmed_txs|consensus_state|dump_consensus_state|consensus_params)(?![\w-])/,
  ],
  ["a node's RPC port", /:26657(?!\d)/],
  ["an indexer's GraphQL operation", /^\s*(?:query|subscription|mutation)\b[^{]*\{/],
  ["the chain package's fake node", /^@gnoworld\/chain\/testing(?:\/|$)/],
];

interface Part {
  type: string;
  value?: unknown;
  operator?: string;
  left?: Part;
  right?: Part;
  quasis?: readonly { value: { cooked?: string | null; raw: string } }[];
}

// A string's text as a request would send it: a literal's value, a template's with `${}` for each value, a sum of both
// joined the same way; nothing for any other node.
function textOf(node: Part): string | undefined {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type === "TemplateLiteral")
    return node.quasis?.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("${}");
  return node.type === "BinaryExpression" ? sumOf(node) : undefined;
}

function sumOf({ operator, left, right }: Part): string | undefined {
  if (operator !== "+" || left === undefined || right === undefined) return undefined;
  return `${textOf(left) ?? "${}"}${textOf(right) ?? "${}"}`;
}

const chainRead: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { read: "A read of a chain's node or the indexer goes through @gnoworld/chain (D113): {{what}} is one." },
  },
  create(context) {
    const check = (node: Rule.Node): void => {
      // A string inside a sum is read with the sum, once.
      const { parent } = node;
      if (parent?.type === "BinaryExpression" && parent.operator === "+") return;
      const text = textOf(node);
      const found = text === undefined ? undefined : WORDS.find(([, word]) => word.test(text));
      if (found !== undefined) context.report({ node, messageId: "read", data: { what: found[0] } });
    };
    return { Literal: check, TemplateLiteral: check, BinaryExpression: check };
  },
};

export default defineConfig(
  {
    files: ["packages/chain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [APART] }],
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages/chain",
              from: "./",
              except: ["./packages/chain", "./packages/core", "./packages/schemas", "./node_modules"],
              message: CHAIN,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/chain/**/*.ts"],
    ignores: TESTS,
    rules: {
      // The list above's entry, as a later list replaces an earlier one.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            APART,
            { regex: "^(react|react-dom|react-router|@gnoworld/ui)(/|$)", message: CHAIN },
            { regex: "^zustand(/|$)", message: CHAIN },
          ],
        },
      ],
      "import-x/no-nodejs-modules": "error",
      "no-console": "error",
    },
  },
  {
    // Every module of the app, the services and the packages but the chain package's own; tests and fakes answer as a node.
    files: ["app/src/**/*.{ts,tsx}", "server/**/*.ts", "jarvis/**/*.ts", "packages/*/src/**/*.{ts,tsx}"],
    ignores: ["packages/chain/src/**", "**/testing/**", ...TESTS, ...BENCHES],
    plugins: { gnoworld: { rules: { "chain-read": chainRead } } },
    rules: { "gnoworld/chain-read": "error" },
  },
);
