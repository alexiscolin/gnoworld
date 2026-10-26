import { markdown, type Line } from "@gnoworld/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedIn, embedOf, savesData, unjudged } from "./embeds.ts";

// 4g (docs/decisions.md, 2026-10-26): each service's player as its own documentation gives it (embeds.ts); Imgur's
// form could not be read, so its links stay links until it is.
// The players play on the reader's one Play (F1054).
const YOUTUBE = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1";
const VIMEO = "https://player.vimeo.com/video/76979871?dnt=1&autoplay=1";
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
    // StrykerJS: each form anchored at the path's start, and each read on its own host alone.
    ["a short under another path", "https://www.youtube.com/x/shorts/dQw4w9WgXcQ"],
    ["a Vimeo id under another path", "https://vimeo.com/x/76979871"],
    ["a Vimeo player under another path", "https://player.vimeo.com/x/video/76979871"],
    ["a Vimeo player's path on another host", "https://evil.example/video/76979871"],
    ["a Vimeo player's id of letters", "https://player.vimeo.com/video/7697a871"],
    ["a Vimeo id of 13 digits", "https://vimeo.com/7697987176979"],
    ["a Giphy page's path on another host", "https://evil.example/gifs/4548k01F5Ej28"],
    ["a Giphy page under another path", "https://giphy.com/x/gifs/4548k01F5Ej28"],
    ["Giphy's media under another path", "https://media.giphy.com/x/media/4548k01F5Ej28/giphy.gif"],
    ["Giphy's media with no file", "https://media.giphy.com/media/4548k01F5Ej28"],
    ["a user on the right host", "https://user@www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["a password on the right host", "https://:pw@www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["a port on Giphy", "https://giphy.com:444/embed/4548k01F5Ej28"],
    ["no URL", "not a url"],
    // F873: each accepted host's lookalikes: a longer name, a subdomain, the name before another host.
    ["a host ending in Vimeo's name", "https://notvimeo.com/76979871"],
    ["a subdomain of Vimeo", "https://evil.vimeo.com/76979871"],
    ["Vimeo's name before another host", "https://vimeo.com.evil.example/76979871"],
    ["Vimeo's player's name before another host", "https://player.vimeo.com.evil.example/video/76979871"],
    ["a host ending in Giphy's name", "https://notgiphy.com/embed/4548k01F5Ej28"],
    ["Giphy's name before another host", "https://giphy.com.evil.example/embed/4548k01F5Ej28"],
    ["Giphy's media's name before another host", "https://media.giphy.com.evil.example/media/4548k01F5Ej28/giphy.gif"],
    ["a subdomain of Giphy", "https://evil.giphy.com/embed/4548k01F5Ej28"],
    ["a subdomain of www.youtube.com", "https://evil.www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["a subdomain of youtu.be", "https://evil.youtu.be/dQw4w9WgXcQ"],
    ["a subdomain of YouTube's privacy-enhanced host", "https://evil.www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["a subdomain of www.vimeo.com", "https://evil.www.vimeo.com/76979871"],
    ["a subdomain of Vimeo's player", "https://evil.player.vimeo.com/video/76979871"],
    ["a subdomain of Giphy's media", "https://evil.media.giphy.com/media/4548k01F5Ej28/giphy.gif"],
    // F878: a path one segment past the player's.
    ["a short with a path after its id", "https://www.youtube.com/shorts/dQw4w9WgXcQ/x"],
    ["an embed with a path after its id", "https://www.youtube.com/embed/dQw4w9WgXcQ/x"],
    ["youtu.be with a path after its id", "https://youtu.be/dQw4w9WgXcQ/x"],
    ["a Giphy embed with a path after its id", "https://giphy.com/embed/4548k01F5Ej28/x"],
    ["Giphy's media with a path after its file", "https://media.giphy.com/media/4548k01F5Ej28/giphy.gif/x"],
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

// ADR-0002 §8: a reader on Data saver (a 2G link) gets no player; a browser that says nothing saves nothing.
describe("savesData: whether the reader saves data", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [{ connection: { saveData: true } }, true],
    [{ connection: { saveData: false } }, false],
    [{ connection: { saveData: "true" } }, false],
    [{ connection: null }, false],
    [{ connection: "fast" }, false],
    [{}, false],
  ])("reads a navigator of %j as %s", (navigator, saves) => {
    vi.stubGlobal("navigator", navigator);
    expect(savesData()).toBe(saves);
  });

  it("reads no navigator, the build's pre-render, as saving nothing", () => {
    vi.stubGlobal("navigator", undefined);
    expect(savesData()).toBe(false);
  });
});

// Alexis, 2026-10-26: the page asks the server the verdicts of the lines in view it does not hold, a line older
// than the stream's replay among them; a line with no player needs none, and one asked is not asked again.
describe("unjudged: the lines in view whose player waits on a verdict the page does not hold", () => {
  const line = (id: string, text: string): Line => ({
    id,
    time: "2026-10-26T10:00:00.000Z",
    from: "a",
    text,
    kind: "message",
  });

  it("names each line with a player, no verdict and not asked yet, in the lines' order", () => {
    const lines = [
      line("a", "https://youtu.be/dQw4w9WgXcQ"),
      line("b", "no link"),
      line("c", "https://vimeo.com/76979871"),
      line("d", "https://giphy.com/gifs/4548k01F5Ej28"),
      line("e", "see https://gno.land"),
      line("f", "> https://youtu.be/dQw4w9WgXcQ"),
    ];
    expect(unjudged(lines, { c: "checked" }, new Set(["d"]))).toEqual(["a", "f"]);
    expect(unjudged(lines, undefined, new Set())).toEqual(["a", "c", "d", "f"]);
    expect(unjudged([], undefined, new Set())).toEqual([]);
  });
});
