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
  // F897 (U2): a disabled button said the wait, dim and passed over by Tab; now words do, and Play comes once checked.
  it("says it waits for the moderation's check, in words a reader hears, offers no Play, and loads nothing", () => {
    const html = renderToStaticMarkup(<Embed embed={YOUTUBE} verdict={undefined} />);
    expect(said(html)).toContain("YouTube");
    expect(html).toMatch(/<p role="status"[^>]*>Waiting for the moderation check…<\/p>/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
  });

  it("offers the player once checked, still loading nothing before the click", () => {
    const html = renderToStaticMarkup(<Embed embed={YOUTUBE} verdict="checked" />);
    expect(html).toMatch(/<p role="status"[^>]*>Ready to play<\/p>/);
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
  });

  // F886 (Alexis, 2026-10-26): the site sends no referrer (F682), and its players none either: YouTube's terms ask
  // for one, so a player that refuses to play in the demo brings the question back.
  it.each([
    YOUTUBE,
    { service: "Vimeo", src: "https://player.vimeo.com/video/76979871?dnt=1", title: "Vimeo video" },
    { service: "Giphy", src: "https://giphy.com/embed/4548k01F5Ej28", title: "Giphy animation" },
  ] as const)("sends $service's player no referrer", (embed) => {
    expect(attribute(renderToStaticMarkup(<PlayerFrame embed={embed} />), "referrerPolicy")).toBe("no-referrer");
  });

  it("shows nothing of a link whose message was hidden", () => {
    expect(renderToStaticMarkup(<Embed embed={YOUTUBE} verdict="hidden" />)).toBe("");
  });
});
