import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Embed } from "./Embed.tsx";

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

  it("shows nothing of a link whose message was hidden", () => {
    expect(renderToStaticMarkup(<Embed embed={YOUTUBE} verdict="hidden" />)).toBe("");
  });
});
