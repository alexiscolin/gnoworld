import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Card } from "./Card/Card.tsx";
import { Room, useAlone } from "./alone.tsx";

const seen: [boolean, boolean][] = [];

function Block({ id }: { id: string }) {
  const expand = useAlone(id);
  if (id === "Hours") seen.push([expand.open, expand.rows]);
  return (
    <Card look="hub" open={expand.open}>
      <Card.Header title={id} expand={expand} />
      <Card.Body>{id} body</Card.Body>
    </Card>
  );
}

// A plate: a scroller (the panel's body, which `data-content` names) holding a lede above the room, the room with a section of the Hours card, the Callers card
// and a foot, and a footer under it; the scroll is kept as the browser keeps it.
function plate(extra?: ReactNode) {
  let top = 0;
  const view = render(
    <div data-content="">
      <p data-testid="lede">lede</p>
      <Room data-blocks="">
        <section>
          <Block id="Hours" />
        </section>
        <Block id="Callers" />
        <p data-testid="foot">foot</p>
        {extra}
      </Room>
      <footer data-testid="footer">footer</footer>
    </div>,
  );
  const scroller = view.container.querySelector<HTMLElement>("[data-content]");
  if (scroller === null) throw new Error("no scroller");
  Object.defineProperty(scroller, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  return { ...view, scroller, scrolled: () => top, scroll: (value: number) => (top = value) };
}

const expand = (name: string) => screen.getByRole("button", { name: `Expand ${name}` });
const close = (name: string) => screen.getByRole("button", { name: `Close ${name}` });
const alone = () => document.querySelectorAll("[data-alone]");
const aside = () => document.querySelectorAll("[data-aside]");
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

interface Played {
  node: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
}

// An `animate` that records each animation, its cancel and, when asked, waits for its finish.
function animating(wait = false) {
  const played: Played[] = [];
  Object.assign(Element.prototype, {
    animate(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let finish: () => void = () => undefined;
      const finished = wait ? new Promise<void>((resolve) => (finish = resolve)) : Promise.resolve();
      const cancel = vi.fn();
      played.push({ node: this, keyframes, options, cancel, finish });
      return { finished, cancel };
    },
  });
  return played;
}

// The boxes elements have: the card's is `first` until its first read after a swap, then `last`; any other is a hundred square.
function boxes(first: DOMRect, last: DOMRect) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName !== "ARTICLE") return new DOMRect(0, 0, 100, 100);
    return this.closest("[data-aside]") === null && document.querySelector("[data-alone]") === this ? last : first;
  });
}

beforeEach(() => {
  seen.length = 0;
  document.documentElement.style.setProperty("--motion-slow", "360ms");
  document.documentElement.style.removeProperty("--motion-scale");
  // The reader's system has no reduced-motion preference: jsdom's own answers no to every query, "no preference" too.
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: media === "(prefers-reduced-motion: no-preference)",
    media,
  }));
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "animate");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a card that opens alone", () => {
  it("opens one card at a time: opening another closes the first, with no move", async () => {
    plate();
    const played = animating();
    fireEvent.click(expand("Hours"));
    await settle();
    expect(alone()).toHaveLength(1);
    const moves = played.length;
    fireEvent.click(expand("Callers"));
    expect(alone()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Close Hours" })).toBeNull();
    expect(close("Callers")).toBeTruthy();
    expect(played).toHaveLength(moves);
  });

  it("closes with its Shrink button, and with Escape, the focus back on the Expand button", () => {
    plate();
    const button = expand("Hours");
    fireEvent.click(button);
    fireEvent.click(close("Hours"));
    expect(alone()).toHaveLength(0);
    expect(document.activeElement).toBe(button);
    fireEvent.click(expand("Hours"));
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alone()).toHaveLength(0);
    expect(document.activeElement).toBe(expand("Hours"));
  });

  it("leaves the plate scrolled where it was, each time, never where an earlier close had it", () => {
    const { scroll, scrolled } = plate();
    scroll(340);
    fireEvent.click(expand("Callers"));
    expect(scrolled()).toBe(0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(scrolled()).toBe(340);
    scroll(50);
    fireEvent.click(expand("Hours"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(scrolled()).toBe(50);
  });

  it("marks what is off the card's way while it is open, and unmarks it at the close", () => {
    plate();
    fireEvent.click(expand("Hours"));
    expect(screen.getByTestId("lede").hasAttribute("data-aside")).toBe(true);
    expect(screen.getByTestId("foot").hasAttribute("data-aside")).toBe(true);
    expect(screen.getByTestId("footer").hasAttribute("data-aside")).toBe(true);
    expect(document.querySelector("[data-alone]")?.closest("[data-aside]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aside()).toHaveLength(0);
  });

  it("hides a block that comes while the card is open, which no swap marked", async () => {
    const view = plate();
    fireEvent.click(expand("Hours"));
    const late = document.createElement("p");
    late.dataset["testid"] = "late";
    view.container.querySelector("[data-blocks]")?.append(late);
    await settle();
    expect(late.hasAttribute("data-aside")).toBe(true);
  });

  it("says what it did to a reader who cannot see: the card opened alone, then the page back", () => {
    plate();
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(expand("Hours"));
    const said = screen.getByRole("status");
    expect(said.textContent).toContain("Hours");
    expect(said.textContent).toMatch(/Escape/);
    expect(said.closest("[data-aside]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("status").textContent).toBe("Back to the page.");
  });

  it("stops what was moving when the room goes", () => {
    const played = animating(true);
    const view = plate();
    fireEvent.click(expand("Hours"));
    expect(played.length).toBeGreaterThan(0);
    view.unmount();
    for (const each of played) expect(each.cancel).toHaveBeenCalled();
  });

  it("clears the marks it made on the page when the room goes while a card is open (a new place)", () => {
    const tree = (room: boolean) => (
      <div data-content="">
        <p data-testid="lede">lede</p>
        {room ? (
          <Room key="a">
            <Block id="Hours" />
          </Room>
        ) : (
          <span />
        )}
      </div>
    );
    const view = render(tree(true));
    fireEvent.click(expand("Hours"));
    const lede = screen.getByTestId("lede");
    expect(lede.hasAttribute("data-aside")).toBe(true);
    view.rerender(tree(false));
    expect(lede.hasAttribute("data-aside")).toBe(false);
  });

  it("does not hide anything again once it is closed, however the close came and whatever changes after", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    plate();
    fireEvent.click(expand("Hours"));
    const calls = disconnect.mock.calls.length;
    fireEvent.click(close("Hours"));
    expect(disconnect.mock.calls.length).toBeGreaterThan(calls);
    const late = document.createElement("p");
    document.querySelector("[data-blocks]")?.append(late);
    await settle();
    expect(aside()).toHaveLength(0);
  });

  it("puts the page's own scroll back at the close, and takes it to the top for the open", () => {
    plate();
    Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
    const to = vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    });
    fireEvent.click(expand("Hours"));
    expect(to).toHaveBeenLastCalledWith(0, 0);
    fireEvent.click(close("Hours"));
    expect(to).toHaveBeenLastCalledWith(0, 120);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("opens from a toggle that names no button, with nothing to hide for it and nothing broken", () => {
    function Bare() {
      const expand = useAlone("bare");
      return (
        <article data-testid="bare" data-alone={expand.open ? "" : undefined}>
          <button
            type="button"
            onClick={() => {
              expand.onToggle();
            }}
          >
            go
          </button>
        </article>
      );
    }
    render(
      <div data-content="">
        <Room>
          <Bare />
          <p>other</p>
        </Room>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByTestId("bare").hasAttribute("data-alone")).toBe(true);
    expect(aside()).toHaveLength(0);
  });

  it("sets the room the card fills from the scroller's height", () => {
    const { scroller } = plate();
    Object.defineProperty(scroller, "clientHeight", { value: 700 });
    fireEvent.click(expand("Hours"));
    const room = document.querySelector<HTMLElement>("[data-blocks]")?.style.getPropertyValue("--plate-room");
    expect(Number.parseFloat(room ?? "")).toBeGreaterThan(400);
  });

  it("fills the room with the screen's share when it is lower than the scroller, less the scroller's padding", () => {
    const { scroller } = plate();
    const blocks = () => document.querySelector<HTMLElement>("[data-blocks]")?.style.getPropertyValue("--plate-room");
    Object.defineProperty(scroller, "clientHeight", { value: 5000, configurable: true });
    fireEvent.click(expand("Hours"));
    expect(blocks()).toBe(`${String(window.innerHeight * 0.85)}px`);
    fireEvent.click(close("Hours"));
    Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
    const style = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((node) =>
      node === scroller ? ({ paddingBlockStart: "20px", paddingBlockEnd: "30px" } as CSSStyleDeclaration) : style(node),
    );
    fireEvent.click(expand("Hours"));
    expect(blocks()).toBe("450px");
  });

  it("still opens in place with no plate around it", () => {
    render(<Block id="Hours" />);
    fireEvent.click(expand("Hours"));
    expect(alone()).toHaveLength(1);
    fireEvent.click(close("Hours"));
    expect(alone()).toHaveLength(0);
  });
});

describe("the rows a card shows when open", () => {
  it("come a render after the card opens and go in the render it closes, never open rows on a closed card", async () => {
    plate();
    fireEvent.click(expand("Hours"));
    await settle();
    const [shut, shown] = [seen.findIndex(([open, rows]) => open && !rows), seen.findIndex(([, rows]) => rows)];
    expect(seen[shut]).toEqual([true, false]);
    expect(shut).toBeLessThan(shown);
    expect(seen.at(-1)).toEqual([true, true]);
    seen.length = 0;
    fireEvent.click(close("Hours"));
    await settle();
    expect(seen.some(([open, rows]) => !open && rows)).toBe(false);
    expect(seen.at(-1)).toEqual([false, false]);
  });
});

describe("Escape", () => {
  it("is ignored when nothing is open", () => {
    plate();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alone()).toHaveLength(0);
  });

  it("is left to a dialog around the focus, a field being typed in, an input method composing", () => {
    plate();
    fireEvent.click(expand("Hours"));
    const field = document.body.appendChild(document.createElement("textarea"));
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(alone()).toHaveLength(1);
    field.remove();
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(alone()).toHaveLength(1);
    const dialog = document.body.appendChild(document.createElement("dialog"));
    dialog.setAttribute("open", "");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alone()).toHaveLength(1);
    dialog.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alone()).toHaveLength(0);
  });

  it("is not the card's when the focus is out of the plate, on a control of another part of the page", () => {
    plate();
    fireEvent.click(expand("Hours"));
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(alone()).toHaveLength(1);
    outside.remove();
  });

  it("leaves the Escape a tooltip took to the tooltip, and closes the card at the next one (WCAG 1.4.13)", () => {
    plate();
    fireEvent.click(expand("Hours"));
    const tip = document.body.appendChild(document.createElement("span"));
    tip.setAttribute("popover", "manual");
    tip.setAttribute("aria-hidden", "true");
    const first = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    first.preventDefault();
    act(() => {
      document.dispatchEvent(first);
    });
    expect(alone()).toHaveLength(1);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true }));
    });
    expect(alone()).toHaveLength(0);
    tip.remove();
  });

  it("is heard first, before anything that stops a key on its way up", () => {
    plate();
    fireEvent.click(expand("Hours"));
    const button = close("Hours");
    button.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
    fireEvent.keyDown(button, { key: "Escape" });
    expect(alone()).toHaveLength(0);
  });

  it("stops listening once the card is closed or the room is gone, its keys and its resize", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const view = plate();
    fireEvent.click(expand("Hours"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(removeWindow.mock.calls.some(([type]) => type === "resize")).toBe(true);
    view.unmount();
  });

  it("measures the room again when the window is resized while a card is open", () => {
    const { scroller } = plate();
    Object.defineProperty(scroller, "clientHeight", { value: 700, configurable: true });
    fireEvent.click(expand("Hours"));
    Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
    const before = document.querySelector<HTMLElement>("[data-blocks]")?.style.getPropertyValue("--plate-room");
    fireEvent(window, new Event("resize"));
    expect(document.querySelector<HTMLElement>("[data-blocks]")?.style.getPropertyValue("--plate-room")).not.toBe(
      before,
    );
  });
});

describe("the move", () => {
  it("fades the others and holds them gone, then swaps, cancels the fades and grows the card from its cell", async () => {
    plate();
    const played = animating();
    boxes(new DOMRect(10, 20, 100, 50), new DOMRect(0, 0, 200, 100));
    fireEvent.click(expand("Hours"));
    expect(alone()).toHaveLength(0);
    const fades = played.filter(({ keyframes }) => keyframes[1]?.["opacity"] === 0);
    expect(fades).toHaveLength(4);
    expect(fades.every(({ options }) => options.fill === "forwards")).toBe(true);
    await settle();
    expect(alone()).toHaveLength(1);
    for (const fade of fades) expect(fade.cancel).toHaveBeenCalled();
    const card = document.querySelector("[data-alone]");
    const grown = played.find(({ node }) => node === card);
    expect(grown?.keyframes[0]).toMatchObject({ transform: "translate(10px, 20px) scale(0.5, 0.5)" });
    expect(grown?.keyframes[1]).toMatchObject({ transform: "none" });
    const words = played.find(({ node }) => node === card?.firstElementChild);
    expect(words?.keyframes[1]).toMatchObject({ opacity: 0, offset: 0.45 });
  });

  it("does not draw a card that has no size, and moves nothing then", async () => {
    plate();
    const played = animating();
    boxes(new DOMRect(0, 0, 0, 0), new DOMRect(0, 0, 0, 0));
    fireEvent.click(expand("Hours"));
    await settle();
    expect(alone()).toHaveLength(1);
    expect(played.some(({ node }) => node === document.querySelector("[data-alone]"))).toBe(false);
  });

  it("waits for the fades before it swaps, and a second click meanwhile changes nothing", async () => {
    plate();
    const played = animating(true);
    fireEvent.click(expand("Hours"));
    const count = played.length;
    fireEvent.click(expand("Hours"));
    await settle();
    expect(played).toHaveLength(count);
    expect(alone()).toHaveLength(0);
    act(() => {
      for (const each of played) each.finish();
    });
    await settle();
    expect(alone()).toHaveLength(1);
    expect(close("Hours")).toBeTruthy();
  });

  it("brings the others back on a close in the order they arrived: the plate's order, not the nearest first", async () => {
    plate();
    const played = animating();
    fireEvent.click(expand("Hours"));
    await settle();
    played.length = 0;
    fireEvent.click(close("Hours"));
    await settle();
    const comes = played.filter(({ keyframes }) => keyframes[0]?.["opacity"] === 0 && keyframes[1]?.["opacity"] === 1);
    const names = comes.map(({ node }) => node.getAttribute("data-testid") ?? node.tagName);
    expect(names).toEqual(["lede", "ARTICLE", "foot", "footer"]);
    expect(comes.every(({ options }) => options.fill === "backwards")).toBe(true);
    const delays = comes.map(({ options }) => Number(options.delay));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("fades nothing out on a close, and swaps although a fade is pending", async () => {
    plate();
    const played = animating(true);
    fireEvent.click(expand("Hours"));
    act(() => {
      for (const each of played) each.finish();
    });
    await settle();
    played.length = 0;
    fireEvent.click(close("Hours"));
    await settle();
    expect(played.filter(({ keyframes }) => keyframes[1]?.["opacity"] === 0)).toHaveLength(0);
    expect(alone()).toHaveLength(0);
  });

  it("swaps all the same when a fade's finish is rejected, as one cancelled by the page", async () => {
    plate();
    Object.assign(Element.prototype, {
      animate: () => ({ finished: Promise.reject(new Error("cancelled")), cancel: vi.fn() }),
    });
    fireEvent.click(expand("Hours"));
    await settle();
    expect(alone()).toHaveLength(1);
  });

  it("puts the focus back on the opening button without scrolling to it", () => {
    plate();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fireEvent.click(expand("Hours"));
    fireEvent.click(close("Hours"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not move under reduced motion, nor under the app's calm setting: the swap is at once", () => {
    plate();
    const played = animating();
    vi.stubGlobal("matchMedia", (media: string) => ({ matches: media === "(prefers-reduced-motion: reduce)", media }));
    fireEvent.click(expand("Hours"));
    expect(alone()).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: media === "(prefers-reduced-motion: no-preference)",
      media,
    }));
    document.documentElement.style.setProperty("--motion-scale", "0");
    fireEvent.click(expand("Hours"));
    expect(alone()).toHaveLength(1);
    expect(played).toHaveLength(0);
  });
});

// The plate's cards rise in their stagger as the plate comes (Card/useRise.ts): its tests sit here, beside the room, as the Card folder's
// tests are display-only and a default run skips them.
describe("a rising card's delay (--d)", () => {
  const watchers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  let now = 0;

  beforeEach(() => {
    now = 0;
    watchers.length = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(run: (entries: { isIntersecting: boolean }[]) => void) {
          watchers.push(run);
        }
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset["arrivedAt"];
  });

  const cards = (count: number) =>
    render(
      <div data-content="">
        {Array.from({ length: count }, (_, at) => (
          <Card key={at} rises>
            <Card.Header title={`Card ${String(at)}`} />
          </Card>
        ))}
      </div>,
    );
  const see = (at: number, time: number) => {
    now = time;
    act(() => {
      watchers[at]?.([{ isIntersecting: true }]);
    });
  };
  const delays = (view: ReturnType<typeof cards>) =>
    [...view.container.querySelectorAll("article")].map((card) => card.style.getPropertyValue("--d"));

  it("counts the cards that came with the plate: 0.90 s, then 0.05 s more for each", () => {
    const view = cards(3);
    [0, 1, 2].forEach((at) => {
      see(at, at);
    });
    expect(delays(view)).toEqual(["0.90s", "0.95s", "1.00s"]);
  });

  it("is none for a card that scrolls in long after the first one came", () => {
    const view = cards(3);
    see(0, 0);
    see(1, 1000);
    see(2, 2000);
    expect(delays(view)).toEqual(["0.90s", "0.95s", "0s"]);
  });

  it("counts from the arrival's own start, a card seen late landing in step", () => {
    document.documentElement.dataset["arrivedAt"] = "800";
    const view = cards(1);
    see(0, 1000);
    expect(delays(view)).toEqual(["0.70s"]);
  });
});
