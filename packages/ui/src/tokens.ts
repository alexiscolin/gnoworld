// The tokens of tokens.css as data, for the token page: the file stays the one list.
import css from "./tokens.css?raw";

export interface Token {
  name: string;
  value: string;
  group: string;
}

// The page's groups, each by the prefixes of its names; a token in none of them fails a test.
export const GROUPS = [
  { name: "Primitives", prefixes: ["--p-"] },
  { name: "Colour", prefixes: ["--color-"] },
  { name: "Type", prefixes: ["--family-", "--font-", "--tracking-"] },
  { name: "Space", prefixes: ["--space-"] },
  { name: "Size", prefixes: ["--control-", "--icon-", "--size-", "--column-", "--measure", "--dialog-"] },
  { name: "Shape", prefixes: ["--radius-", "--line-", "--focus-"] },
  { name: "Motion", prefixes: ["--motion-", "--ease-"] },
  { name: "Effects", prefixes: ["--opacity-"] },
];

/** Each name once, with its first value: the media queries' overrides keep the base one. */
export function parseTokens(text: string): Token[] {
  const seen = new Map<string, Token>();
  for (const [, name = "", value = ""] of text
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (seen.has(name)) continue;
    const group = GROUPS.find((g) => g.prefixes.some((prefix) => name.startsWith(prefix)))?.name ?? "Other";
    seen.set(name, { name, value: value.trim(), group });
  }
  return [...seen.values()];
}

export const TOKENS = parseTokens(css);
