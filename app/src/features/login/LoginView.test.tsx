import { Address } from "@gnoworld/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginView, type LoginViewProps } from "./LoginView.tsx";

// The first screen has bytes to spare for no one: the name of the account (9f) is a chunk of its own, reached only by `import()`.
const FIRST_SCREEN = import.meta.glob<string>(
  ["./Login{View,Control}.tsx", "../account/AccountMenu.tsx", "../../shellHeader.tsx", "../../store/*.ts"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);
// Every source of the app, to follow the static imports of the first screen's files through the files they reach (F5847).
const SOURCES = import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const HERE = "./LoginView.test.tsx";
const STATIC = /^(?:import|export)\s(?!type\b)[^;]*?from\s+["'](\.[^"']*)["']/gm;
const isNames = (file: string) => /\/features\/names\/|\/lib\/chain\/names\.ts$/.test(file);

// `spec` as a path of the glob's kind, from the file that imports it.
function resolve(from: string, spec: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}
// Every file `start` reaches through imports that run when it loads: a dynamic `import()` is the way out, and starts none.
function reached(sources: Record<string, string>, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    const text = sources[file];
    if (seen.has(file) || text === undefined) continue;
    seen.add(file);
    for (const [, spec = ""] of text.matchAll(STATIC)) queue.push(resolve(file, spec));
  }
  return seen;
}

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
// The words a page says, its markup taken off.
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
const view = (over: Partial<LoginViewProps> = {}) =>
  renderToStaticMarkup(
    <LoginView session={{ kind: "out" }} step="idle" problem={undefined} onLogIn={() => undefined} {...over} />,
  );
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => said(m[1] ?? ""));

describe("LoginView", () => {
  it("offers no login before it knows whether one is open, its status region already there, empty", () => {
    const html = view({ session: { kind: "unknown" } });
    expect(buttons(html)).toEqual([]);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(said(html)).toBe("");
  });

  it("offers one pill, Connect Adena, to nobody logged in, and tells a phone to log in on a computer, then that it can write from there", () => {
    const html = view();
    expect(buttons(html)).toEqual(["Connect Adena"]);
    expect(said(html)).toContain("To log in, use a computer; once logged in you can write from here.");
    expect(said(html)).not.toContain("To speak");
  });

  it.each([
    ["wallet", "Opening Adena…"],
    ["signing", "Sign the text in Adena…"],
    ["verifying", "Checking your signature…"],
  ] as const)("says the step a login is at (%s), its button busy, so it starts once", (step, words) => {
    const html = view({ step });
    expect(buttons(html)).toEqual([words]);
    expect(html).toMatch(/<button[^>]*aria-busy="true"/);
  });

  it.each(["in", "unknown"] as const)(
    "is its status region alone, no box round it, while the session is %s: an empty box would hold a gap in the header's row (8p's review)",
    (kind) => {
      const html = view({ session: kind === "in" ? { kind, address: ADDRESS } : { kind } });
      expect(html).toMatch(/^<p role="status"[^>]*><\/p>$/);
    },
  );

  it("draws nothing but its status region once logged in: the account's pill and its menu hold the address and the way out (frame 17)", () => {
    const html = view({ session: { kind: "in", address: ADDRESS } });
    expect(buttons(html)).toEqual([]);
    expect(said(html)).toBe("");
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it("says why a logout failed while the account is still in, in its status region (the red pass's medium)", () => {
    const html = view({ session: { kind: "in", address: ADDRESS }, problem: { reason: "network" } });
    expect(html).toMatch(
      /role="status"[^>]*>The server could not be reached\. Check your connection, then try again\.</,
    );
  });

  // Alexis, 2026-11-07: the login's error stood beside the button; it is the button's own words now, short, the whole sentence its
  // description and its status region's, which shows nothing on its own (D377).
  it.each([
    [{ reason: "too_many" } as const, "Wait a minute", "Too many tries: wait a minute, then try again."],
    [{ reason: "locked" } as const, "Unlock Adena", "Unlock Adena, then try again."],
    [
      { reason: "address", problem: "checksum" } as const,
      "Check Adena's address",
      "Adena's address does not match its checksum: a character in it is wrong.",
    ],
  ])(
    "says why the last login stopped in its button, short, the whole sentence its description: %j",
    (problem, short, whole) => {
      const html = view({ problem });
      const escaped = (words: string) => words.replaceAll("'", "&#x27;");
      expect(buttons(html)).toEqual([escaped(short)]);
      expect(html).toContain(`aria-description="${escaped(whole)}"`);
      expect(html).toMatch(/<p role="status" class="[^"]*visually-hidden[^"]*">/);
    },
  );

  it("says why the last login stopped, in its status region", () => {
    const html = view({ problem: { reason: "address", problem: "checksum" } });
    expect(html).toMatch(/role="status"[^>]*>[^<]*Adena&#x27;s address does not match its checksum/);
  });
});

describe("LoginView: what a problem changes", () => {
  it("shows the problem's whole sentence, not hidden, once the session is in, and hides the one that has a button", () => {
    const shown = view({ session: { kind: "in", address: ADDRESS }, problem: { reason: "network" } });
    expect(shown).toMatch(/<p role="status" class="(?![^"]*visually-hidden)[^"]*">/);
    expect(view({ problem: { reason: "network" } })).toMatch(/<p role="status" class="[^"]*visually-hidden[^"]*">/);
  });

  it.each(["wallet", "signing", "verifying"] as const)(
    "keeps the step's words, no alert and no description, while a login is at %s though a problem is kept",
    (step) => {
      const html = view({ step, problem: { reason: "locked" } });
      expect(buttons(html)).not.toContain("Unlock Adena");
      expect(html).not.toContain("aria-description");
      expect(buttons(html)).toHaveLength(1);
      expect(html).not.toContain("<svg");
    },
  );
});

describe("the first screen and the account's name", () => {
  it("reads the first screen's files, the login's view among them", () => {
    expect(Object.keys(FIRST_SCREEN)).toEqual(
      expect.arrayContaining([
        "./LoginView.tsx",
        "./LoginControl.tsx",
        "../account/AccountMenu.tsx",
        "../../shellHeader.tsx",
      ]),
    );
  });

  it.each(Object.keys(FIRST_SCREEN))("%s imports nothing of features/names or lib/chain/names statically", (file) => {
    expect([...reached(SOURCES, resolve(HERE, file))].filter(isNames)).toEqual([]);
  });

  it("finds a file of names through a file between, and not through a dynamic import", () => {
    const plant = {
      "./a.ts": 'import { b } from "./b.ts";',
      "./b.ts": 'export { c } from "./features/names/c.ts";',
      "./features/names/c.ts": "export const c = 1;",
      "./d.ts": 'const later = () => import("./features/names/c.ts");',
    };
    expect([...reached(plant, "./a.ts")].filter(isNames)).toEqual(["./features/names/c.ts"]);
    expect([...reached(plant, "./d.ts")].filter(isNames)).toEqual([]);
  });

  it("draws the short address from the one place the app has it", () => {
    expect(FIRST_SCREEN["../account/AccountMenu.tsx"]).toMatch(/shortAddress.*from "@gnoworld\/schemas"/);
    expect(FIRST_SCREEN["../account/AccountMenu.tsx"]).not.toMatch(/slice\(0, 6\)/);
  });

  it("holds the dynamic import the account's menu reaches the name by", () => {
    expect(FIRST_SCREEN["../account/AccountMenu.tsx"]).toMatch(/import\("\.\.\/names\/index\.ts"\)/);
  });
});
