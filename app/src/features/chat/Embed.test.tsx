// @vitest-environment jsdom
import type { ShownLine } from "@gnoworld/core";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { Embed, PlayerFrame } from "./Embed.tsx";
import { LineView } from "./LineView.tsx";

// The prototype is set for the whole file (jsdom has none): put back after it.
const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
afterAll(() => {
  if (original === undefined) Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  else Object.defineProperty(Element.prototype, "scrollIntoView", original);
});

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

  // The player is a state of its own, kept across what the line shows (CR1/S1 of the room edit): a reader pressed Play on a
  // checked link, then the author's correction brought the line another verdict.
  describe("once playing", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const show = (verdict: Parameters<typeof Embed>[0]["verdict"]) => {
      act(() => {
        root.render(<Embed embed={YOUTUBE} verdict={verdict} />);
      });
    };
    const play = () => {
      act(() => {
        // The player's button: the author's name before it opens their card (8d).
        host.querySelector<HTMLButtonElement>("button:not([aria-haspopup])")?.click();
      });
    };
    // jsdom has no layout: the frame's scrollIntoView is not there.
    Element.prototype.scrollIntoView = () => undefined;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    afterEach(() => {
      act(() => {
        root.render(null);
      });
    });

    it("plays the frame once the reader pressed Play on a checked link", () => {
      show("checked");
      play();
      expect(host.querySelector("iframe")?.getAttribute("src")).toBe(YOUTUBE.src);
    });

    it("falls back to its card, no frame, when the verdict leaves checked for none (a correction awaiting its check)", () => {
      show("checked");
      play();
      show(undefined);
      expect(host.querySelector("iframe")).toBeNull();
      expect(host.textContent).toContain("Waiting for the moderation check…");
      // Back to checked, it waits for a click again.
      show("checked");
      expect(host.querySelector("iframe")).toBeNull();
    });

    it("shows nothing when the verdict goes from checked to hidden while it plays", () => {
      show("checked");
      play();
      show("hidden");
      expect(host.childElementCount).toBe(0);
    });

    it("waits for a click again when a hidden line is checked again (R1 of the second red pass)", () => {
      show("checked");
      play();
      show("hidden");
      show("checked");
      expect(host.querySelector("iframe")).toBeNull();
      expect(host.textContent).toContain("Ready to play");
    });

    // Another link, though its verdict is already "checked", is a card again: the key is the link's source.
    it("starts a card, not a frame, when an edit brings another link", () => {
      const line = (text: string): ShownLine => ({
        id: "AB12",
        time: "2026-10-25T10:00:00.000Z",
        from: "a",
        account: "a",
        text,
        kind: "message",
      });
      const view = (text: string) => {
        act(() => {
          root.render(
            <ul>
              <LineView
                line={line(text)}
                me="a"
                members={new Set()}
                stop={false}
                actions={null}
                fresh={false}
                verdict="checked"
                players
                saved={false}
                pinned={false}
                chips={undefined}
                react={undefined}
                answers={undefined}
              />
            </ul>,
          );
        });
      };
      view("https://youtu.be/dQw4w9WgXcQ");
      play();
      expect(host.querySelector("iframe")?.getAttribute("src")).toContain("dQw4w9WgXcQ");
      view("https://youtu.be/9bZkp7q19f0");
      expect(host.querySelector("iframe")).toBeNull();
      expect(host.textContent).toContain("Ready to play");
    });
  });
});

function Late() {
  const [verdict, setVerdict] = useState<"checked">();
  return (
    <>
      <Embed embed={YOUTUBE} verdict={verdict} />
      <a
        href="#verdict"
        onClick={() => {
          setVerdict("checked");
        }}
      >
        verdict
      </a>
    </>
  );
}

// What the card says as time passes, and where the focus goes as the player closes.
describe("Embed's wait and its close", () => {
  const wait = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  const status = (box: HTMLElement) => one(box, "[role=status]").textContent;
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says it could not check the link once the verdict is awaited past 15 s, and offers no Play", () => {
    vi.useFakeTimers();
    const box = mount(<Embed embed={YOUTUBE} verdict={undefined} />);
    wait(14_999);
    expect(status(box)).toBe("Waiting for the moderation check…");
    wait(1);
    expect(status(box)).toBe("Couldn't check this link");
    expect(all(box, "iframe, button:not([aria-haspopup])")).toEqual([]);
  });

  it("offers Play, with no late word, when the verdict comes after the wait ran out", () => {
    vi.useFakeTimers();
    const box = mount(<Late />);
    wait(15_000);
    click(one(box, "a"));
    expect(status(box)).toBe("Ready to play");
    expect(button(box, `Play the ${YOUTUBE.title}`)).toBeDefined();
  });

  it("closes the player on the reader's word and gives the focus back to Play", () => {
    Element.prototype.scrollIntoView = () => undefined;
    const box = mount(<Embed embed={YOUTUBE} verdict="checked" />);
    click(button(box, `Play the ${YOUTUBE.title}`));
    expect(all(box, "iframe")).toHaveLength(1);
    click(button(box, "Close the player"));
    expect(all(box, "iframe")).toEqual([]);
    expect(document.activeElement).toBe(button(box, `Play the ${YOUTUBE.title}`));
  });
});
