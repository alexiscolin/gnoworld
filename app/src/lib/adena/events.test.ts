import { describe, expect, it, vi } from "vitest";
import { listen } from "./events.ts";

// Adena's `On(event, func)`: a listener cannot be removed and only the first one registered hears (plan 9, 9b).
class Wallet {
  registered: { event: string; func: (value: string) => void }[] = [];
  On(event: string, func: (value: string) => void) {
    this.registered.push({ event, func });
  }
  emit(event: string, value: string) {
    // As the extension does: the first listener of the event only.
    this.registered.find((r) => r.event === event)?.func(value);
  }
}

describe("listen", () => {
  it("registers changedAccount and changedNetwork, one listener each", () => {
    const adena = new Wallet();
    listen(adena, { account: vi.fn(), network: vi.fn() });
    expect(adena.registered.map((r) => r.event).sort()).toEqual(["changedAccount", "changedNetwork"]);
  });

  it("passes an account change and a network change to the handlers", () => {
    const adena = new Wallet();
    const account = vi.fn();
    const network = vi.fn();
    listen(adena, { account, network });
    adena.emit("changedAccount", "g1other");
    adena.emit("changedNetwork", "gnoland-1");
    expect(account).toHaveBeenCalledExactlyOnceWith("g1other");
    expect(network).toHaveBeenCalledExactlyOnceWith("gnoland-1");
  });

  it("registers once however many components mount: the next calls add no listener", () => {
    const adena = new Wallet();
    for (let i = 0; i < 5; i++) listen(adena, { account: vi.fn(), network: vi.fn() });
    expect(adena.registered).toHaveLength(2);
  });

  it("tells the latest handlers, once, as the first listener cannot be replaced", () => {
    const adena = new Wallet();
    const old = { account: vi.fn(), network: vi.fn() };
    const latest = { account: vi.fn(), network: vi.fn() };
    listen(adena, old);
    listen(adena, latest);
    adena.emit("changedAccount", "g1other");
    expect(latest.account).toHaveBeenCalledExactlyOnceWith("g1other");
    expect(old.account).not.toHaveBeenCalled();
  });

  it("registers again for another wallet object: a new page's extension", () => {
    const first = new Wallet();
    const second = new Wallet();
    listen(first, { account: vi.fn(), network: vi.fn() });
    listen(second, { account: vi.fn(), network: vi.fn() });
    expect(first.registered).toHaveLength(2);
    expect(second.registered).toHaveLength(2);
  });

  it.each([
    ["nothing", undefined],
    ["an object with no On", {}],
    ["an On that is no function", { On: 1 }],
    [
      "an On that throws",
      {
        On() {
          throw new Error("extension gone");
        },
      },
    ],
  ])("is not thrown by %s", (_, adena) => {
    expect(() => {
      listen(adena, { account: vi.fn(), network: vi.fn() });
    }).not.toThrow();
  });

  it("is not thrown by a handler that throws: Adena's emitter never sees it", () => {
    const adena = new Wallet();
    listen(adena, {
      account: () => {
        throw new Error("store");
      },
      network: vi.fn(),
    });
    expect(() => {
      adena.emit("changedAccount", "g1other");
    }).not.toThrow();
  });

  it.each([7, null, undefined, { address: "g1x" }])("drops an event whose value is %j: it is no string", (value) => {
    const adena = new Wallet();
    const account = vi.fn();
    const network = vi.fn();
    listen(adena, { account, network });
    adena.emit("changedAccount", value as never);
    adena.emit("changedNetwork", value as never);
    expect(account).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("tries again to register after an On that threw, as the extension may come up later", () => {
    let fail = true;
    const registered: string[] = [];
    const adena = {
      On(event: string) {
        if (fail) throw new Error("not yet");
        registered.push(event);
      },
    };
    listen(adena, { account: vi.fn(), network: vi.fn() });
    fail = false;
    listen(adena, { account: vi.fn(), network: vi.fn() });
    expect(registered.sort()).toEqual(["changedAccount", "changedNetwork"]);
  });

  it("registers only the event that is missing after one On threw and the other did not", () => {
    const registered: string[] = [];
    let failNetwork = true;
    const adena = {
      On(event: string) {
        if (event === "changedNetwork" && failNetwork) throw new Error("not yet");
        registered.push(event);
      },
    };
    listen(adena, { account: vi.fn(), network: vi.fn() });
    failNetwork = false;
    listen(adena, { account: vi.fn(), network: vi.fn() });
    expect(registered.sort()).toEqual(["changedAccount", "changedNetwork"]);
  });
});
