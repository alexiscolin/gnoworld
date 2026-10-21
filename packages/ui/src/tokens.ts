// The tokens of tokens.css as data, for the token page: the file stays the one list.
import css from "./tokens.css?raw";

export interface Token {
  name: string;
  value: string;
  group: string;
}

// Functions, not constants: what a module computes once as it loads, a mutant switched on during a
// test never reaches.

/** The page's groups, in order, each by the prefixes of its names; a token in none fails a test. */
export function groups() {
  return [
    { name: "Primitives", prefixes: ["--p-"] },
    { name: "Colour", prefixes: ["--color-"] },
    { name: "Type", prefixes: ["--family-", "--font-", "--tracking-"] },
    { name: "Space", prefixes: ["--space-"] },
    {
      name: "Size",
      prefixes: [
        "--control-",
        "--icon-",
        "--size-",
        "--column-",
        "--measure",
        "--switch-",
        "--dialog-",
        "--popover-",
        "--thumb-",
        "--avatar-",
      ],
    },
    { name: "Shape", prefixes: ["--radius-", "--line-", "--focus-"] },
    { name: "Motion", prefixes: ["--motion-", "--ease-"] },
    { name: "Effects", prefixes: ["--opacity-", "--shadow-"] },
  ];
}

/** Each name once, with its first value: the media queries' overrides keep the base one. */
export function parseTokens(text: string): Token[] {
  const seen = new Map<string, Token>();
  const table = groups();
  for (const [, name = "", value = ""] of text
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (seen.has(name)) continue;
    const group = table.find((g) => g.prefixes.some((prefix) => name.startsWith(prefix)))?.name ?? "Other";
    seen.set(name, { name, value: value.trim(), group });
  }
  return [...seen.values()];
}

/** The tokens of tokens.css. */
export function tokens() {
  return parseTokens(css);
}
