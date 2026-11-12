// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// 7d6: the hero counts what the cosmos draws; 7n2: the home reads that count from the few bytes the job writes beside the worlds' file, on
// phones and computers alike, so a phone asks nothing of the cosmos before View in space. The scene's own read of the file (worldsFile.ts),
// when it runs, says what it draws, and that count stands.
const read = vi.hoisted(() => ({ count: vi.fn(), worlds: vi.fn() }));
vi.mock("../../lib/chain/worldsCount.ts", () => ({ readWorldsCount: read.count }));
vi.mock("../../lib/chain/realms.ts", () => ({ readWorlds: read.worlds }));

const counted = (count: number) => ({ version: 1, universe: "onyx", updated: "2026-11-03T10:00:00Z", count });
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
  read.count.mockImplementationOnce(
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
const readsAnswered = () =>
  act(async () => {
    await Promise.all(read.count.mock.results.map(({ value }) => value as unknown));
  });

// A fresh visit each test: the count is the page's, for as long as it is open.
async function visit() {
  vi.resetModules();
  const count = await import("./worldsCount.ts");
  const { worldsFile } = await import("./worldsFile.ts");
  const seen: (number | null | undefined)[] = [];
  const drawn: (number | undefined)[] = [];
  function Home({ wanted }: { wanted: boolean }) {
    seen.push(count.useWorldsCount(wanted));
    return null;
  }
  // The hero's reader of the scene's count (useWorldsDrawn is the module's own: the hook says it through useWorldsCount, whose read of the
  // count file never comes here).
  function Hero() {
    drawn.push(count.useWorldsCount(true) ?? undefined);
    return null;
  }
  const mounted = (element: ReactElement) => {
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(element);
    });
    return root;
  };
  // A home on a root of its own; `to` draws the same home again, with what it now wants.
  const opened = (wanted = true) => {
    const root = mounted(<Home wanted={wanted} />);
    const to = (now: boolean) => {
      act(() => {
        root.render(<Home wanted={now} />);
      });
    };
    const leave = () => {
      act(() => {
        root.unmount();
      });
    };
    return { to, leave };
  };
  const open = (wanted = true) => opened(wanted).leave;
  const hero = () => {
    read.count.mockImplementationOnce(() => new Promise(() => undefined));
    const root = mounted(<Hero />);
    return () => {
      act(() => {
        root.unmount();
      });
    };
  };
  const served = () => renderToString(<Home wanted />);
  const told = (n: number) => {
    act(() => {
      count.worldsDrawn(n);
    });
  };
  const scene = () => act(() => worldsFile());
  return { open, opened, hero, seen, drawn, served, told, scene };
}

afterEach(() => {
  read.count.mockReset();
  read.worlds.mockReset();
});

describe("the worlds the cosmos draws", () => {
  it("knows no count until a read says one, then gives it to every page that asks", async () => {
    const { hero, drawn, told } = await visit();
    const leave = hero();
    expect(drawn.at(-1)).toBeUndefined();
    told(534);
    expect(drawn.at(-1)).toBe(534);
    leave();
    const again = hero();
    expect(drawn.at(-1)).toBe(534);
    again();
  });

  it("stops telling a page that left", async () => {
    const { hero, drawn, told } = await visit();
    hero()();
    const heard = drawn.length;
    told(12);
    expect(drawn).toHaveLength(heard);
  });
});

describe("the hero's number, from the worlds' count", () => {
  it("shows on a home whose scene never runs, from the count file at the site's base, and asks nothing of the worlds' file", async () => {
    read.count.mockResolvedValue(counted(534));
    const { open, seen } = await visit();
    const leave = open();
    expect(seen.at(-1)).toBeUndefined();
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(1);
    expect(read.count.mock.calls[0]?.[0]).toBe("/");
    expect(seen.at(-1)).toBe(534);
    expect(read.worlds).not.toHaveBeenCalled();
    leave();
  });

  it("asks nothing on another universe's home, whose number is its own list", async () => {
    read.count.mockResolvedValue(counted(534));
    const { open, seen } = await visit();
    open(false)();
    await readsAnswered();
    expect(read.count).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeUndefined();
  });

  it("says none came once the read brought nothing, so the line can name the worlds without a figure", async () => {
    read.count.mockResolvedValue(undefined);
    const { open, seen } = await visit();
    const leave = open();
    expect(seen.at(-1)).toBeUndefined();
    await readsAnswered();
    expect(seen.at(-1)).toBeNull();
    expect(
      read.worlds,
      "a missing count asks nothing of the worlds' file: a phone before View in space",
    ).not.toHaveBeenCalled();
    leave();
  });

  it("asks again on the next home after a read that brought nothing", async () => {
    read.count.mockResolvedValueOnce(undefined).mockResolvedValue(counted(534));
    const { open, seen } = await visit();
    open()();
    await readsAnswered();
    const leave = open();
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(534);
    expect(read.worlds).not.toHaveBeenCalled();
    leave();
  });

  it("asks nothing more once the count is known: a home opened again shows it at once", async () => {
    read.count.mockResolvedValue(counted(534));
    const { open, seen } = await visit();
    open()();
    await readsAnswered();
    const leave = open();
    expect(seen.at(-1)).toBe(534);
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(1);
    leave();
  });

  it("is read once for a second home that opens while the first one's read runs, and for the same home drawn again", async () => {
    const answer = held();
    const { open, opened, seen } = await visit();
    open()();
    const home = opened();
    home.to(true);
    answer(counted(534));
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(534);
    home.leave();
  });

  it("tells every home that shared a read that brought nothing that none came", async () => {
    const answer = held();
    const { opened, seen } = await visit();
    const first = opened();
    const second = opened();
    answer(undefined);
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(1);
    expect(seen.slice(-2)).toEqual([null, null]);
    first.leave();
    second.leave();
  });

  it("asks once a home already open comes to want the number, and gives none once it no longer does", async () => {
    read.count.mockResolvedValue(counted(534));
    const { opened, seen } = await visit();
    const home = opened(false);
    await readsAnswered();
    expect(read.count).not.toHaveBeenCalled();
    home.to(true);
    await readsAnswered();
    expect(read.count).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(534);
    home.to(false);
    expect(seen.at(-1)).toBeUndefined();
    home.leave();
  });

  it("reads nothing while the build writes the page, which holds no number", async () => {
    read.count.mockResolvedValue(counted(534));
    const { seen, served } = await visit();
    expect(served()).toBe("");
    await readsAnswered();
    expect(read.count).not.toHaveBeenCalled();
    expect(seen).toEqual([undefined]);
  });

  it("asks nothing for a home that opens after the scene said its count", async () => {
    const { open, seen, told } = await visit();
    told(534);
    const leave = open();
    expect(seen.at(-1)).toBe(534);
    await readsAnswered();
    expect(read.count).not.toHaveBeenCalled();
    leave();
  });

  it("keeps the count the scene drew when the count file comes after it: the hero never says another number than the cosmos", async () => {
    const answer = held();
    const { open, seen, told } = await visit();
    const leave = open();
    told(535);
    answer(counted(534));
    await readsAnswered();
    expect(seen.at(-1)).toBe(535);
    leave();
  });

  it("takes the scene's count over the count file's when the scene's read comes later", async () => {
    read.count.mockResolvedValue(counted(534));
    const { open, seen, told } = await visit();
    const leave = open();
    await readsAnswered();
    told(535);
    expect(seen.at(-1)).toBe(535);
    leave();
  });

  it("shows the scene's count once a read of the count file brought none", async () => {
    read.count.mockResolvedValue(undefined);
    const { open, seen, told } = await visit();
    const leave = open();
    await readsAnswered();
    expect(seen.at(-1)).toBeNull();
    told(534);
    expect(seen.at(-1)).toBe(534);
    leave();
  });
});

describe("the scene's read of the worlds' file", () => {
  it("reads the file at the site's base, and counts what it brings, each world once and the Earth", async () => {
    read.worlds.mockResolvedValue(fileOf());
    const { hero, drawn, scene } = await visit();
    const leave = hero();
    expect((await scene())?.worlds).toHaveLength(4);
    // One read for the page's life, shared by space and its rail: the query's own signal, cut only when no reader is left.
    expect(read.worlds).toHaveBeenCalledWith("/", {
      fetch: expect.any(Function) as unknown,
      signal: expect.any(AbortSignal) as unknown,
    });
    expect(drawn.at(-1)).toBe(3);
    expect(read.count, "the hero's own ask of the count file, none from the scene's read").toHaveBeenCalledTimes(1);
    leave();
  });

  it("says what it drew over a count the home read first: the hero says the number the cosmos draws", async () => {
    read.count.mockResolvedValue(counted(534));
    read.worlds.mockResolvedValue(fileOf());
    const { open, seen, scene } = await visit();
    const leave = open();
    await readsAnswered();
    expect(seen.at(-1)).toBe(534);
    await scene();
    expect(seen.at(-1)).toBe(3);
    leave();
  });

  it("counts nothing when the read brings nothing", async () => {
    read.worlds.mockResolvedValue(undefined);
    const { hero, drawn, scene } = await visit();
    const leave = hero();
    expect(await scene()).toBeUndefined();
    expect(drawn.at(-1)).toBeUndefined();
    leave();
  });
});
