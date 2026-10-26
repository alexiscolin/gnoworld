import { markdown } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { embedIn, embedOf } from "./embeds.ts";

// 4g (docs/decisions.md, 2026-10-26): each service's player as its own documentation gives it (embeds.ts); Imgur's
// form could not be read, so its links stay links until it is.
const YOUTUBE = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
const VIMEO = "https://player.vimeo.com/video/76979871?dnt=1";
const GIPHY = "https://giphy.com/embed/4548k01F5Ej28";

describe("embedOf: the player a link opens", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=3",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ",
  ])("opens YouTube's privacy-enhanced player for %s", (href) => {
    expect(embedOf(href)).toStrictEqual({ service: "YouTube", src: YOUTUBE, title: "YouTube video" });
  });

  it.each(["https://vimeo.com/76979871", "https://www.vimeo.com/76979871", "https://player.vimeo.com/video/76979871"])(
    "opens Vimeo's player, tracking off, for %s",
    (href) => {
      expect(embedOf(href)).toStrictEqual({ service: "Vimeo", src: VIMEO, title: "Vimeo video" });
    },
  );

  it.each([
    "https://giphy.com/gifs/howtogiphygifs-how-to-4548k01F5Ej28",
    "https://giphy.com/gifs/4548k01F5Ej28",
    "https://giphy.com/embed/4548k01F5Ej28",
    "https://media.giphy.com/media/4548k01F5Ej28/giphy.gif",
  ])("opens Giphy's player for %s", (href) => {
    expect(embedOf(href)).toStrictEqual({ service: "Giphy", src: GIPHY, title: "Giphy animation" });
  });

  // The threat model's Embeds row: an accepted service's look is no service; an id outside its alphabet is none.
  it.each([
    ["another host", "https://evil.example/watch?v=dQw4w9WgXcQ"],
    ["a host ending in an accepted one's name", "https://notyoutube.com/watch?v=dQw4w9WgXcQ"],
    ["an accepted name before another host", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"],
    ["a user and password before the host", "https://user:pw@evil.example/watch?v=dQw4w9WgXcQ"],
    ["a port", "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ"],
    ["plain http", "http://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["a watch page with no video", "https://www.youtube.com/watch?list=PL1"],
    ["a YouTube id one short", "https://youtu.be/dQw4w9WgXc"],
    ["a YouTube id one long", "https://youtu.be/dQw4w9WgXcQQ"],
    ["a YouTube id with a quote", 'https://www.youtube.com/watch?v=dQw4w9W"XcQ'],
    ["a YouTube channel", "https://www.youtube.com/@gnoland"],
    ["a Vimeo page that is no video", "https://vimeo.com/channels/staffpicks"],
    ["a Vimeo id with letters", "https://vimeo.com/7697a871"],
    ["a Giphy search", "https://giphy.com/search/gno"],
    ["a Giphy id with a dot", "https://giphy.com/embed/4548k01F.Ej28"],
    ["Imgur, whose player is not read yet", "https://imgur.com/gallery/abcdefg"],
    ["no URL", "not a url"],
  ])("opens none for %s", (_, href) => {
    expect(embedOf(href)).toBeUndefined();
  });
});

describe("embedIn: the player a line's first such link opens", () => {
  it("finds the first accepted link of a line, in a quote, a list or a mark too", () => {
    expect(embedIn(markdown("see https://evil.example then https://youtu.be/dQw4w9WgXcQ"))?.src).toBe(YOUTUBE);
    expect(embedIn(markdown("> [this](https://vimeo.com/76979871)"))?.src).toBe(VIMEO);
    expect(embedIn(markdown("- **https://giphy.com/gifs/4548k01F5Ej28**"))?.src).toBe(GIPHY);
    expect(embedIn(markdown("[a](https://vimeo.com/76979871) and https://youtu.be/dQw4w9WgXcQ"))?.service).toBe(
      "Vimeo",
    );
  });

  it("finds none in a line of plain links or none, nor in code", () => {
    expect(embedIn(markdown("https://gno.land and [docs](https://docs.gno.land)"))).toBeUndefined();
    expect(embedIn(markdown("`https://youtu.be/dQw4w9WgXcQ`"))).toBeUndefined();
    expect(embedIn(markdown("no link at all"))).toBeUndefined();
  });
});
