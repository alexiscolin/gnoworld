import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button/Button.tsx";
import { EmptyState } from "./EmptyState/EmptyState.tsx";
import { LinkProvider, type PageLinkProps } from "./link.tsx";
import { Row } from "./Row/Row.tsx";

// A page's link, as the app's router gives one: it marks what it draws, so a test sees it was used.
function PageLink(props: PageLinkProps) {
  return <a data-page-link="" {...props} />;
}

// Every attribute of the one link a piece draws, with the page's link and without, its mark aside.
function both(piece: ReactNode) {
  const attributes = () =>
    Object.fromEntries([...screen.getByRole("link").attributes].map(({ name, value }) => [name, value]));
  const { unmount } = render(piece);
  const plain = attributes();
  unmount();
  render(<LinkProvider link={PageLink}>{piece}</LinkProvider>);
  const { "data-page-link": mark, ...paged } = attributes();
  return { plain, paged, mark };
}

describe("LinkProvider", () => {
  it("draws a link-button with the page's link, keeping all the plain anchor says", () => {
    const { plain, paged, mark } = both(
      <Button href="/w/bubble" emphasis="solid" size="s">
        Fly to Bubble
      </Button>,
    );
    expect(mark).toBe("");
    expect(paged).toEqual(plain);
    expect(plain).toMatchObject({ href: "/w/bubble", "data-emphasis": "solid", "data-size": "s" });
  });

  it("draws a row's link with the page's link, keeping all the plain anchor says, current included", () => {
    const { plain, paged, mark } = both(<Row title="Bubble" href="/w/bubble" current />);
    expect(mark).toBe("");
    expect(paged).toEqual(plain);
    expect(plain).toMatchObject({ href: "/w/bubble", "aria-current": "true" });
  });

  it("draws an empty state's action with the page's link", () => {
    const { mark } = both(
      <EmptyState title="Nothing yet" line="No world here." action={{ label: "Explore", href: "/" }} />,
    );
    expect(mark).toBe("");
  });

  // An error page's way out: the app may be what failed, so the document loads again (F325).
  it("leaves a link that reloads the page to a plain anchor, even to the site's own path", () => {
    render(
      <LinkProvider link={PageLink}>
        <Button href="/" reload>
          Back to the universe
        </Button>
        <EmptyState
          title="Something went wrong"
          line="Try again."
          action={{ label: "Home", href: "/", reload: true }}
        />
      </LinkProvider>,
    );
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/"]);
    for (const link of links) expect(link.hasAttribute("data-page-link")).toBe(false);
  });

  it("draws a plain anchor where no page gives its link, as in Storybook", () => {
    render(<Button href="/w/bubble">Fly to Bubble</Button>);
    expect(screen.getByRole("link").hasAttribute("data-page-link")).toBe(false);
  });

  // Only a path from the site's root is the page's to follow: another site, a mail, a place in the
  // page, a path relative to where the router stands, or a script never reach the router.
  it.each([
    "https://gno.land/",
    "//gno.land/",
    "//",
    "/\\gno.land/",
    // A browser drops tabs and line ends from an address, so these are "//gno.land/" too (F311).
    "/\t/gno.land/",
    "/\n/gno.land/",
    "/\r/gno.land/",
    "/\t\\gno.land/",
    "mailto:team@gno.land",
    "#text",
    "w/bubble",
    "javascript:alert(1)",
  ])("leaves %s to a plain anchor, even with the page's link", (href) => {
    render(
      <LinkProvider link={PageLink}>
        <Button href={href}>Go</Button>
        <Row title="Go" href={href} />
      </LinkProvider>,
    );
    for (const link of screen.getAllByRole("link")) expect(link.hasAttribute("data-page-link")).toBe(false);
  });
});

// F326: the app says which paths are its pages; a path that names a file (the sitemap) stays a plain anchor.
describe("LinkProvider's pages", () => {
  const pages = (href: string) => !href.endsWith(".xml");

  it("draws a link to a path the app does not route as a plain anchor, and the others with the page's link", () => {
    render(
      <LinkProvider link={PageLink} pages={pages}>
        <Button href="/sitemap.xml">Sitemap</Button>
        <Button href="/w/bubble">Bubble</Button>
      </LinkProvider>,
    );
    expect(screen.getByRole("link", { name: "Sitemap" }).hasAttribute("data-page-link")).toBe(false);
    expect(screen.getByRole("link", { name: "Bubble" }).hasAttribute("data-page-link")).toBe(true);
  });

  it("still sends a path outside the site, whatever the app says, to a plain anchor", () => {
    render(
      <LinkProvider link={PageLink} pages={() => true}>
        <Button href="//evil.example/x">Away</Button>
      </LinkProvider>,
    );
    expect(screen.getByRole("link", { name: "Away" }).hasAttribute("data-page-link")).toBe(false);
  });
});
