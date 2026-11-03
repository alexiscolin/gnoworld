// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// 7n: the hero's number comes from the worlds' file, read by the page itself, so a home whose scene never runs (no WebGL, a scene refused, a
// phone before View in space) still shows it. The scene, when it comes, takes that read: one request and one parse for both.
const read = vi.hoisted(() => vi.fn());
vi.mock("../../lib/chain/realms.ts", () => ({ readWorlds: read }));

const fileOf = () => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-03T10:00:00Z",
  // Four entries, two worlds: counted each once with the Earth, 3, never the entries' 4.
  worlds: [
    { id: "a/b", namespace: "a", realms: [] },
    { id: "a/b", namespace: "a", realms: [] },
    { id: "a/b", namespace: "a", realms: [] },
    { id: "c/d", namespace: "c", realms: [] },
  ],
});

// A read the test answers when it chooses.
function held() {
  let answer: (file: unknown) => void = () => undefined;
  read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        answer = done;
      }),
  );
  return (file: unknown) => {
    answer(file);
  };
}

// Every read the test made has answered and been counted: the reads' own promises, not a number of turns.
const settled = () =>
  act(async () => {
    await Promise.all(read.mock.results.map(({ value }) => value as unknown));
  });

// A fresh visit each test: the read and the count are the page's, for as long as it is open.
async function visit() {
  vi.resetModules();
  const file = await import("./worldsFile.ts");
  const seen: (number | null | undefined)[] = [];
  function Home({ wanted }: { wanted: boolean }) {
    seen.push(file.useWorldsCount(wanted));
    return null;
  }
  // A home on a root of its own; `to` draws the same home again, with what it now wants.
  const opened = (wanted = true) => {
    const root = createRoot(document.createElement("div"));
    const to = (now: boolean) => {
      act(() => {
        root.render(<Home wanted={now} />);
      });
    };
    to(wanted);
    const leave = () => {
      act(() => {
        root.unmount();
      });
    };
    return { to, leave };
  };
  const open = (wanted = true) => opened(wanted).leave;
  const served = () => renderToString(<Home wanted />);
  return { open, opened, seen, served, worldsFile: file.worldsFile };
}

// A few turns of the microtask queue, for a step where a read the test holds is still unanswered.
const turned = () =>
  act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });

afterEach(() => {
  read.mockReset();
  vi.useRealTimers();
});

describe("the hero's number, from the worlds' file", () => {
  it("shows on a home whose scene never runs: the page reads the file itself, each world once and the Earth", async () => {
    read.mockResolvedValue(fileOf());
    const { open, seen } = await visit();
    const leave = open();
    expect(seen.at(-1)).toBeUndefined();
    await settled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("/", {});
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("asks nothing on another universe's home, whose number is its own list", async () => {
    read.mockResolvedValue(fileOf());
    const { open, seen } = await visit();
    open(false)();
    await settled();
    expect(read).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeUndefined();
  });

  it("is read once when the page and the scene both want it: the scene takes the page's read, come or coming", async () => {
    const answer = held();
    const { open, seen, worldsFile } = await visit();
    const leave = open();
    const scene = worldsFile(new AbortController().signal);
    const file = fileOf();
    answer(file);
    await settled();
    expect(await scene).toBe(file);
    expect(read).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("hands the scene a read the page made before it came, without asking again", async () => {
    read.mockResolvedValue(fileOf());
    const { open, worldsFile } = await visit();
    open()();
    await settled();
    expect((await worldsFile(new AbortController().signal))?.worlds).toHaveLength(4);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("gives the page's read to one scene: a later one reads the file as it is then, with its own signal", async () => {
    read.mockResolvedValue(fileOf());
    const { open, worldsFile } = await visit();
    open()();
    await settled();
    await worldsFile(new AbortController().signal);
    const leaving = new AbortController();
    await worldsFile(leaving.signal);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith("/", { signal: leaving.signal });
  });

  it("asks again on the next home after a read that brought nothing", async () => {
    read.mockResolvedValueOnce(undefined).mockResolvedValue(fileOf());
    const { open, seen } = await visit();
    open()();
    await settled();
    expect(seen.at(-1)).toBeUndefined();
    const leave = open();
    await settled();
    expect(read).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("says none came once the page's read brought nothing, so the line can name the worlds without a figure", async () => {
    read.mockResolvedValueOnce(undefined).mockResolvedValue(fileOf());
    const { open, seen, worldsFile } = await visit();
    const leave = open();
    expect(seen.at(-1)).toBeUndefined();
    await settled();
    expect(seen.at(-1)).toBeNull();
    await worldsFile(new AbortController().signal);
    await settled();
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("lets the scene read on its own after the page's read brought nothing, and counts what it brings", async () => {
    read.mockResolvedValueOnce(undefined).mockResolvedValue(fileOf());
    const { open, seen, worldsFile } = await visit();
    const leave = open();
    await settled();
    expect((await worldsFile(new AbortController().signal))?.worlds).toHaveLength(4);
    await settled();
    expect(read).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("asks nothing more once the count is known: a home opened again shows it at once", async () => {
    read.mockResolvedValue(fileOf());
    const { open, seen, worldsFile } = await visit();
    open()();
    await settled();
    await worldsFile(new AbortController().signal);
    const leave = open();
    await settled();
    expect(seen.at(-1)).toBe(3);
    expect(read).toHaveBeenCalledTimes(1);
    leave();
  });

  it("is read once for a second home that opens while the first one's read runs, and for the same home drawn again", async () => {
    const answer = held();
    const { open, opened, seen } = await visit();
    open()();
    const home = opened();
    home.to(true);
    answer(fileOf());
    await settled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(3);
    home.leave();
  });

  it("asks once a home already open comes to want the number, and gives none once it no longer does", async () => {
    read.mockResolvedValue(fileOf());
    const { opened, seen } = await visit();
    const home = opened(false);
    await settled();
    expect(read).not.toHaveBeenCalled();
    home.to(true);
    await settled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(3);
    home.to(false);
    expect(seen.at(-1)).toBeUndefined();
    home.leave();
  });

  it("reads nothing while the build writes the page, which holds no number", async () => {
    read.mockResolvedValue(fileOf());
    const { seen, served } = await visit();
    expect(served()).toBe("");
    await settled();
    expect(read).not.toHaveBeenCalled();
    expect(seen).toEqual([undefined]);
  });

  it("is read once for a home that opens while the read a scene took still runs", async () => {
    read.mockResolvedValue(fileOf());
    const answer = held();
    const { open, seen, worldsFile } = await visit();
    open()();
    const scene = worldsFile(new AbortController().signal);
    const leave = open();
    answer(fileOf());
    await settled();
    expect((await scene)?.worlds).toHaveLength(4);
    expect(read).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  // A page's read the scene took fails while a second scene's own read runs: each test opens a home on a side of that failure.
  const twoReads = async () => {
    read.mockResolvedValue(fileOf());
    const page = held();
    const own = held();
    const opened = await visit();
    opened.open()();
    const first = opened.worldsFile(new AbortController().signal);
    const second = opened.worldsFile(new AbortController().signal);
    return { ...opened, first, second, page, own };
  };

  it("lets go of a read that brought nothing alone: the page's share of the read still running stays for the next scene", async () => {
    const { open, seen, worldsFile, first, second, page, own } = await twoReads();
    const leave = open();
    page(undefined);
    own(fileOf());
    await settled();
    expect(await first).toBeUndefined();
    expect((await second)?.worlds).toHaveLength(4);
    expect(seen.at(-1)).toBe(3);
    expect((await worldsFile(new AbortController().signal))?.worlds).toHaveLength(4);
    expect(read).toHaveBeenCalledTimes(2);
    leave();
  });

  it("shares with a home that opens after a read brought nothing the read still running, rather than ask again", async () => {
    const { open, seen, page, own } = await twoReads();
    page(undefined);
    await turned();
    const leave = open();
    own(fileOf());
    await settled();
    expect(read).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("keeps the page's read for a scene a minute, as the host lets a browser keep the file, and then lets it go", async () => {
    vi.useFakeTimers();
    read.mockResolvedValue(fileOf());
    const early = await visit();
    early.open()();
    await settled();
    vi.advanceTimersByTime(59_000);
    await early.worldsFile(new AbortController().signal);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    const late = await visit();
    late.open()();
    await settled();
    vi.advanceTimersByTime(60_000);
    await late.worldsFile(new AbortController().signal);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("counts what the scene's own read brings, for a home that opens after it", async () => {
    read.mockResolvedValue(fileOf());
    const { open, seen, worldsFile } = await visit();
    await worldsFile(new AbortController().signal);
    const leave = open();
    expect(seen.at(-1)).toBe(3);
    await settled();
    expect(read).toHaveBeenCalledTimes(1);
    leave();
  });
});
