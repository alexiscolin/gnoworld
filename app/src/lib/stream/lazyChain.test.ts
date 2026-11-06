import { describe, expect, it, vi } from "vitest";
import type { ChainFeed } from "./chainFeed.ts";
import { lazyChain } from "./lazyChain.ts";

// Slice 9g: the feed's chunk is asked for on the first event, once, and what came meanwhile is given to it in order.
function setup() {
  const told: string[] = [];
  const stop = vi.fn();
  const feed: ChainFeed = {
    chain: (data) => {
      told.push(`chain ${String(data)}`);
    },
    realms: (data) => {
      told.push(`realms ${String(data)}`);
    },
    stop,
  };
  const loaded = Promise.withResolvers<ChainFeed>();
  const load = vi.fn(() => loaded.promise);
  return {
    lazy: lazyChain(load),
    load,
    told,
    stop,
    arrive: () => {
      loaded.resolve(feed);
    },
    loaded,
  };
}

describe("the lazy feed", () => {
  it("loads nothing before the first event", () => {
    const { load } = setup();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once on the first event and gives it every event heard meanwhile, in order", async () => {
    const { lazy, load, told, arrive } = setup();
    lazy.chain("a");
    lazy.realms("b");
    lazy.chain("c");
    expect(load).toHaveBeenCalledTimes(1);
    arrive();
    await vi.waitFor(() => {
      expect(told).toEqual(["chain a", "realms b", "chain c"]);
    });
  });

  it("gives nothing to a feed that arrives after the stop, and stops one that is there", async () => {
    const late = setup();
    late.lazy.chain("a");
    late.lazy.stop();
    late.arrive();
    await late.loaded.promise;
    await Promise.resolve();
    expect(late.told).toEqual([]);
    const there = setup();
    there.lazy.chain("a");
    there.arrive();
    await vi.waitFor(() => {
      expect(there.told).toEqual(["chain a"]);
    });
    there.lazy.stop();
    await vi.waitFor(() => {
      expect(there.stop).toHaveBeenCalled();
    });
  });

  it("asks for the chunk again on the next event after a load that failed, and gives that event to it", async () => {
    const told: string[] = [];
    const feed: ChainFeed = {
      chain: (data) => {
        told.push(String(data));
      },
      realms: () => undefined,
      stop: () => undefined,
    };
    const load = vi.fn<() => Promise<ChainFeed>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(feed);
    const lazy = lazyChain(load);
    lazy.chain("a");
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();
    lazy.chain("b");
    await vi.waitFor(() => {
      expect(told).toEqual(["b"]);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("is silent when the chunk cannot load: a feed that is not there is no line", async () => {
    const lazy = lazyChain(() => Promise.reject(new Error("offline")));
    expect(() => {
      lazy.chain("a");
      lazy.stop();
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
