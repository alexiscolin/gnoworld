import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABUSE, eachStory } from "../testing.tsx";
import { PlanetThumb } from "./PlanetThumb.tsx";
import * as stories from "./PlanetThumb.stories.tsx";

const everything = (root: HTMLElement) =>
  [...root.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value)).join(" ");

describe("PlanetThumb", () => {
  it("is a picture named by its place, of its kind, a world and medium unless asked", () => {
    render(<PlanetThumb src="/thumbs/bubble.png" name="Bubble" />);
    const picture = screen.getByRole("img", { name: "Bubble" });
    expect(picture.getAttribute("src")).toBe("/thumbs/bubble.png");
    const disc = picture.closest<HTMLElement>("[data-kind]");
    expect([disc?.dataset["kind"], disc?.dataset["size"]]).toEqual(["world", "m"]);
  });

  it("is decoration beside its name when the row says it already", () => {
    const { container } = render(<PlanetThumb src="/thumbs/bubble.png" name="Bubble" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("magnifies under the pointer only when asked, as the dock does", () => {
    const { container, rerender } = render(<PlanetThumb src="/a.png" name="A" />);
    expect((container.firstElementChild as HTMLElement).dataset["magnify"]).toBeUndefined();
    rerender(<PlanetThumb src="/a.png" name="A" magnify />);
    expect((container.firstElementChild as HTMLElement).dataset["magnify"]).toBe("");
  });

  it("keeps a name made of markup, or very long, as its picture's words: one picture, nothing more", () => {
    for (const text of ABUSE) {
      const { container, unmount } = render(<PlanetThumb src="/a.png" name={text} />);
      const pictures = container.querySelectorAll("img");
      expect(pictures).toHaveLength(1);
      expect(pictures[0]?.getAttribute("alt")).toBe(text);
      expect(pictures[0]?.getAttribute("src")).toBe("/a.png");
      unmount();
    }
  });

  // F336: an image from another host tells it each visitor's address. The refusal lives in the component, so no
  // caller (a data file's value, a future capture) can pass around it. A refused src draws the thumb's own fallback.
  const FOREIGN = [
    "https://evil.example/a.png",
    "HTTPS://evil.example/a.png",
    "Https://evil.example/a.png",
    "http://evil.example/a.png",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "\\\\evil.example\\a.png",
    "\\/evil.example/a.png",
    "/\t/evil.example/a.png",
    "/\n/evil.example/a.png",
    "/\r/evil.example/a.png",
    "///evil.example/a.png",
    "\u0001//evil.example/a.png",
    " //evil.example/a.png",
    "\r\n//evil.example/a.png",
    "https://evil.example/data:image/a.png",
    " data:image/png;base64,AA==",
    "/\u001f/a.png",
    "/\u007f/a.png",
    "https:evil.example/a.png",
    "https:/evil.example/a.png",
    "thumbs/a.png",
    " https://evil.example/a.png",
    "\thttps://evil.example/a.png",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:application/javascript,alert(1)",
    "data:,hello",
    "blob:https://evil.example/1",
    "ftp://evil.example/a.png",
    "",
  ];

  it.each(FOREIGN)("refuses the src %j: no picture asks for it, the drawn fallback stands in", (src) => {
    const { container } = render(<PlanetThumb src={src} name="Bubble" />);
    const asked = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "");
    for (const each of asked) expect(each === src && src !== "" ? "refused src used" : "ok").toBe("ok");
    for (const each of asked) expect(each.startsWith("/") || each.startsWith("data:image/")).toBe(true);
    // Whatever the table lists, the browser must resolve every picture to the site itself (data: aside).
    for (const each of asked)
      if (!each.startsWith("data:")) expect(new URL(each, "https://site.test/list").origin).toBe("https://site.test");
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Bubble" })).toBeTruthy();
  });

  it("marks the fallback with an empty data-fallback and gives the disc and the picture their classes", () => {
    const { container } = render(<PlanetThumb src="https://evil.example/a.png" name="Bubble" />);
    expect(container.querySelector("[data-fallback]")?.getAttribute("data-fallback")).toBe("");
    expect(container.querySelector("[data-fallback]")?.className).not.toBe("");
    expect(container.querySelector("img")?.className).not.toBe("");
  });

  it("refuses a foreign src whatever the kind, the size or the other props say", () => {
    const { container } = render(
      <PlanetThumb src="https://evil.example/a.png" name="Sun" kind="star" size="l" magnify />,
    );
    expect(everything(container)).not.toContain("evil.example");
    expect(container.querySelector("[data-fallback]")?.getAttribute("data-kind")).toBe("star");
  });

  it("refuses a foreign src for a decorative thumb too: an empty alt, no request", () => {
    const { container } = render(<PlanetThumb src="//evil.example/a.png" name="Bubble" decorative />);
    expect(everything(container)).not.toContain("evil.example");
    expect(container.querySelector("[data-fallback]")).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  const OWN = [
    "/thumbs/bubble.png",
    "/a.png",
    "/thumbs/a b.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    "data:image/webp;base64,UklGRg==",
    "DATA:image/png;base64,AA==",
  ];
  it.each(OWN)("keeps the site's own src %j as it is, with no fallback", (src) => {
    const { container } = render(<PlanetThumb src={src} name="Bubble" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(src);
    expect(container.querySelector("[data-fallback]")).toBeNull();
  });

  it("sends no referrer with its picture, own or fallback", () => {
    for (const src of ["/thumbs/bubble.png", "https://evil.example/a.png"]) {
      const { container, unmount } = render(<PlanetThumb src={src} name="Bubble" />);
      for (const img of container.querySelectorAll("img"))
        expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
      unmount();
    }
  });

  it("has stories for each kind, at each size", () => {
    const thumbs = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-kind]")].map((p) => p.dataset),
    ).flat();
    for (const kind of ["world", "cluster", "star", "station", "signal"])
      expect(thumbs.map((t) => t["kind"])).toContain(kind);
    for (const size of ["s", "m", "l"]) expect(thumbs.map((t) => t["size"])).toContain(size);
  });
});
