// Our own lint rules, as no rule of ESLint's reads a string's words across literals, templates and sums: no module outside
// packages/chain holds a chain read's words (gnoworld/chain-read, D113, D124), none of the product imports a test helper
// (test-helpers) or the one expression sender but its two builders (chain-eval), and an import at run time names its module
// (named-import, D123). A part of the lint config, which eslint.config.ts composes; the read's words are words.config.ts's.
import type { Rule } from "eslint";
import { defineConfig } from "eslint/config";
import { BENCHES, TESTS } from "./shared.config.ts";
import { ROUTES, WORDS } from "./words.config.ts";

interface Part {
  type: string;
  value?: unknown;
  operator?: string;
  left?: Part;
  right?: Part;
  quasis?: readonly { value: { cooked?: string | null; raw: string } }[];
  name?: string;
  key?: Part;
  properties?: readonly Part[];
  callee?: Part;
  arguments?: readonly Part[];
  source?: Part | null;
  specifiers?: readonly Part[];
  imported?: Part;
  local?: Part;
}

// A string's text as a request would send it: a literal's value, a template's with `${}` for each value, a sum of both
// joined the same way, `+=` a sum whose left side is a value (V4); nothing for any other node.
function textOf(node: Part): string | undefined {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type === "TemplateLiteral")
    return node.quasis?.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("${}");
  if (node.type === "AssignmentExpression" && node.operator === "+=" && node.right !== undefined)
    return `\${}${textOf(node.right) ?? "${}"}`;
  return node.type === "BinaryExpression" ? sumOf(node) : undefined;
}

function sumOf({ operator, left, right }: Part): string | undefined {
  if (operator !== "+" || left === undefined || right === undefined) return undefined;
  return `${textOf(left) ?? "${}"}${textOf(right) ?? "${}"}`;
}

// A JSON-RPC call to a node written as an object: a `jsonrpc` key, and a `method` whose text is a node's route.
function rpcCall(node: Part): boolean {
  const keyed = (name: string) =>
    node.properties?.find(
      ({ key }) => key !== undefined && (key.name ?? key.value) === name && key.type !== "PrivateName",
    );
  const method = keyed("method")?.value as Part | undefined;
  const text = method === undefined ? undefined : textOf(method);
  return keyed("jsonrpc") !== undefined && text !== undefined && new RegExp(`^(?:${ROUTES})$`).test(text);
}

// A node's route given to URL against a base: `new URL("/status", rpc)`.
function routed(node: Part): boolean {
  const [route] = node.arguments ?? [];
  const text = route === undefined ? undefined : textOf(route);
  return node.callee?.name === "URL" && text !== undefined && new RegExp(`^/?(?:${ROUTES})(?:\\?|$)`).test(text);
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
    const report = (what: string) => (node: Rule.Node) => {
      context.report({ node, messageId: "read", data: { what } });
    };
    const call = report("a JSON-RPC call to a node");
    const url = report("a node's route given to URL");
    return {
      Literal: check,
      TemplateLiteral: check,
      BinaryExpression: check,
      AssignmentExpression: check,
      ObjectExpression: (node) => {
        if (rpcCall(node)) call(node);
      },
      NewExpression: (node) => {
        if (routed(node)) url(node);
      },
    };
  },
};

// A test helper imported by product code (D124): a path through a `testing/` folder, by any import or re-export. The helpers
// are free of the chain-read rule only while no module of the product reaches them.
const testHelpers: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { helper: "A test helper is the tests': no module of the product imports one (D124): {{source}}." },
  },
  create(context) {
    const check = (node: Rule.Node): void => {
      const { source } = node as Part;
      const text = source === undefined || source === null ? undefined : textOf(source);
      if (text !== undefined && /(?:^|\/)testing(?:\/|$)/.test(text))
        context.report({ node, messageId: "helper", data: { source: text } });
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

// The one expression sender (D124): readEvaluated sends any expression it is given, so it is imported where a tier-1 or a
// fixed builder makes it alone; a namespace or a run-time import of its module would reach it too.
const chainEval: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      sender:
        "readEvaluated sends any expression: app/src/lib/chain/rpc.ts (evalCall's) and server/src/door/names.ts alone import it (D124).",
    },
  },
  create(context) {
    const check = (node: Rule.Node): void => {
      const { source, specifiers = [] } = node as Part;
      if (source?.value !== "@gnoworld/chain/node") return;
      const named = specifiers.some(
        ({ type, imported, local }) =>
          type === "ImportNamespaceSpecifier" || (imported ?? local)?.name === "readEvaluated",
      );
      if (named || node.type === "ImportExpression" || node.type === "ExportAllDeclaration")
        context.report({ node, messageId: "sender" });
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

// An import made at run time names its module plainly, so the walls can read it (D123, F5282): a computed one could reach
// any folder, the server's from Jarvis included.
const namedImport: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { computed: "An import at run time names its module plainly, so the lint's walls can read it (D123)." },
  },
  create(context) {
    return {
      ImportExpression: (node) => {
        const text = textOf(node.source as Part);
        if (text === undefined || text.includes("${}")) context.report({ node, messageId: "computed" });
      },
    };
  },
};

const GNOWORLD = {
  rules: { "chain-read": chainRead, "test-helpers": testHelpers, "chain-eval": chainEval, "named-import": namedImport },
};
const PRODUCT = ["app/src/**/*.{ts,tsx}", "server/**/*.ts", "jarvis/**/*.ts", "packages/*/src/**/*.{ts,tsx}"];

export default defineConfig(
  {
    // Every module of the app, the services and the packages but the chain package's own; tests and fakes answer as a node.
    files: PRODUCT,
    ignores: ["packages/chain/src/**", "**/testing/**", ...TESTS, ...BENCHES],
    plugins: { gnoworld: GNOWORLD },
    rules: { "gnoworld/chain-read": "error", "gnoworld/test-helpers": "error", "gnoworld/named-import": "error" },
  },
  {
    files: PRODUCT,
    // The two builders of a qeval expression alone (D114): evalCall.ts's in the app, the door's fixed one over a parsed address.
    ignores: ["app/src/lib/chain/rpc.ts", "server/src/door/names.ts"],
    plugins: { gnoworld: GNOWORLD },
    rules: { "gnoworld/chain-eval": "error" },
  },
);
