import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { RouterLink } from "./routerLink.tsx";

// An anchor's attributes, sorted, its router's own mark aside, and its words.
function read(html: string) {
  const attributes = [...html.matchAll(/\s([\w-]+)="([^"]*)"/g)]
    .map(([, name = "", value = ""]) => `${name}=${value}`)
    .filter((attribute) => attribute !== "data-discover=true")
    .sort();
  return { attributes, words: /<a[^>]*>(.*)<\/a>/.exec(html)?.[1] };
}

// What a link-button or a row hands the slot: the router draws the same anchor, going where it says (F328).
test("draws the anchor the design system asks for: every attribute it was given, its href its path", () => {
  const props = { href: "/w/bubble", className: "look", "data-emphasis": "solid", "aria-current": "true" as const };
  const plain = renderToStaticMarkup(<a {...props}>Fly to Bubble</a>);
  const routed = renderToStaticMarkup(
    <MemoryRouter>{RouterLink({ ...props, children: "Fly to Bubble" })}</MemoryRouter>,
  );
  expect(read(routed)).toEqual(read(plain));
  expect(read(plain).attributes).toHaveLength(4);
});
