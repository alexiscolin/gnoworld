import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Embed, PlayerFrame } from "./Embed.tsx";

const YOUTUBE = {
  service: "YouTube",
  src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  title: "YouTube video",
} as const;
const said = (html: string) =>
  html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
// An attribute's value as the frame's markup writes it, or none.
const attribute = (html: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(html)?.[1];

// 4g: a link's player waits for the moderation's "checked", then for a click: no third party is reached before.
describe("Embed", () => {
  it("waits for the moderation's check, its button off, and loads nothing", () => {
    const html = renderToStaticMarkup(<Embed embed={YOUTUBE} verdict={undefined} />);
    expect(said(html)).toContain("YouTube");
    expect(said(html)).toContain("Waiting for the moderation check");
    expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>/);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
  });

  it("offers the player once checked, still loading nothing before the click", () => {
    const html = renderToStaticMarkup(<Embed embed={YOUTUBE} verdict="checked" />);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>[^<]*Play the YouTube video/);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
  });

  // F870: the frame's every permission pinned; a token more (allow-same-origin above all) would hand the player
  // this page's origin, its cookie and its storage.
  it("frames the player in a sandbox of its scripts, its full screen and its links out alone", () => {
    const html = renderToStaticMarkup(<PlayerFrame embed={YOUTUBE} />);
    expect(attribute(html, "src")).toBe(YOUTUBE.src);
    expect(attribute(html, "title")).toBe("YouTube video");
    expect(attribute(html, "sandbox")?.split(" ").toSorted()).toEqual([
      "allow-popups",
      "allow-presentation",
      "allow-scripts",
    ]);
    expect(attribute(html, "allow")).toBe("autoplay; encrypted-media; fullscreen; picture-in-picture");
    expect(attribute(html, "allowFullScreen")).toBe("");
    // YouTube asks for the embedding site's identity in the Referer and recommends this policy, the origin alone
    // (developers.google.com/youtube/terms/required-minimum-functionality, "Embedded player API client identity").
    expect(attribute(html, "referrerPolicy")).toBe("strict-origin-when-cross-origin");
  });

  it("shows nothing of a link whose message was hidden", () => {
    expect(renderToStaticMarkup(<Embed embed={YOUTUBE} verdict="hidden" />)).toBe("");
  });
});
