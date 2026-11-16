// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, test, vi } from "vitest";
import { Button } from "@gnoworld/ui";
import { AppLinks, RouterLink } from "./routerLink.tsx";

// An anchor's attributes, sorted, its router's own mark aside, and its words.
function read(html: string) {
  const attributes = [...html.matchAll(/\s([\w-]+)="([^"]*)"/g)]
    .map(([, name = "", value = ""]) => `${name}=${value}`)
    .filter((attribute) => attribute !== "data-discover=true")
    .sort();
  return { attributes, words: /<a[^>]*>(.*)<\/a>/.exec(html)?.[1] };
}

// What a link-button or a row hands the slot: the router draws the same anchor, going where it says.
test("draws the anchor the design system asks for: every attribute it was given, its href its path", () => {
  const props = { href: "/w/bubble", className: "look", "data-emphasis": "solid", "aria-current": "true" as const };
  const plain = renderToStaticMarkup(<a {...props}>Fly to Bubble</a>);
  // RouterLink reads the full chat's context (a hook), so it is drawn as an element, never called as a function.
  const routed = renderToStaticMarkup(
    <MemoryRouter>
      <RouterLink {...props}>Fly to Bubble</RouterLink>
    </MemoryRouter>,
  );
  expect(read(routed)).toEqual(read(plain));
  expect(read(plain).attributes).toHaveLength(4);
});

// a link to a file of the site (the sitemap) stays a plain anchor, where the catch-all route would say "No page here".
test.each([
  ["/sitemap.xml", false],
  ["/robots.txt", false],
  ["/list", true],
  ["/w/bubble", true],
])("the app's links: %s goes through the router: %s", (href, routed) => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <AppLinks>
        <Button href={href}>Go</Button>
      </AppLinks>
    </MemoryRouter>,
  );
  expect(html).toContain(`href="${href}"`);
  expect(html.includes('data-discover="true"')).toBe(routed);
});

const draw = (phone: boolean) => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: phone && query === "(max-width: 899px)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter>
        <AppLinks>
          <Button href="/w/bubble">Go</Button>
          <Button href="/list">List</Button>
        </AppLinks>
      </MemoryRouter>,
    );
  });
  return [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
};

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the shell's links on a phone", () => {
  it("open a place in its full chat, from anywhere, and a page with no chat as itself", () => {
    expect(draw(true)).toEqual(["/w/bubble?chat=full", "/list"]);
  });
  it("are untouched on a computer", () => {
    expect(draw(false)).toEqual(["/w/bubble", "/list"]);
  });
});
