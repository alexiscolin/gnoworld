import { Address, type Proof } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { listen } from "../../lib/adena/events.ts";
import { knowSession, logIn, logOut, pageClock, readSession, type LoginDeps } from "./logIn.ts";
import { endForAccount, watchAccount } from "./watch.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const CHALLENGE = {
  nonce: "_-09azAZxxxxxxxxxxxxxx",
  text: "Sign in to gnoworld",
  expiresAt: "2026-10-25T10:00:00.000Z",
};
const PROOF: Proof = {
  signed: {
    chain_id: "onyx-1",
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [],
    memo: "",
  },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
};

// The login's parts, each answering as told and recording what it was asked, in order.
const deps = (over: Partial<LoginDeps> = {}) => {
  const asked: string[] = [];
  const store = createAppStore();
  const steps: string[] = [];
  store.subscribe((state) => {
    if (state.login.step !== steps.at(-1)) steps.push(state.login.step);
  });
  const parts: LoginDeps = {
    connect: (adena) => {
      asked.push(`connect ${String(adena)}`);
      return Promise.resolve({ ok: true, address: ADDRESS, chainId: "onyx-1" });
    },
    sign: (_adena, login) => {
      asked.push(`sign ${login.address} ${login.chainId} ${login.text}`);
      return Promise.resolve({ ok: true, proof: PROOF });
    },
    api: {
      challenge: (chainId) => {
        asked.push(`challenge ${chainId}`);
        return Promise.resolve({ ok: true, value: CHALLENGE });
      },
      verify: (request) => {
        asked.push(`verify ${request.nonce} ${request.address}`);
        return Promise.resolve({ ok: true, value: { address: request.address } });
      },
      me: () => {
        asked.push("me");
        return Promise.resolve({ ok: true, value: { address: ADDRESS } });
      },
      logout: () => {
        asked.push("logout");
        return Promise.resolve({ ok: true, value: undefined });
      },
    },
    store,
    ...over,
  };
  return { parts, asked, store, steps };
};

describe("logIn", () => {
  it("reads Adena, asks the chain's challenge, has its text signed unchanged, posts the proof: logged in", async () => {
    const { parts, asked, store, steps } = deps();
    await logIn("the extension", parts);
    expect(asked).toEqual([
      "connect the extension",
      "challenge onyx-1",
      `sign ${ADDRESS} onyx-1 Sign in to gnoworld`,
      `verify ${CHALLENGE.nonce} ${ADDRESS}`,
    ]);
    expect(steps).toEqual(["wallet", "signing", "verifying", "idle"]);
    expect(store.getState().login).toMatchObject({ session: { kind: "in", address: ADDRESS }, problem: undefined });
  });

  it("stops at Adena's refusal, asking the server nothing", async () => {
    const { parts, asked, store } = deps({ connect: () => Promise.resolve({ ok: false, reason: "locked" }) });
    await logIn(undefined, parts);
    expect(asked).toEqual([]);
    expect(store.getState().login).toMatchObject({
      step: "idle",
      problem: { reason: "locked" },
      session: { kind: "unknown" },
    });
  });

  it("keeps the address's problem, so the page says what is wrong with it (F674)", async () => {
    const { parts, store } = deps({
      connect: () => Promise.resolve({ ok: false, reason: "address", problem: "checksum" }),
    });
    await logIn("x", parts);
    expect(store.getState().login.problem).toEqual({ reason: "address", problem: "checksum" });
  });

  it.each([
    [
      "the challenge is refused",
      { challenge: () => Promise.resolve({ ok: false as const, reason: "too_many" as const }) },
      "too_many",
    ],
    [
      "the proof is refused",
      { verify: () => Promise.resolve({ ok: false as const, reason: "refused" as const }) },
      "refused",
    ],
  ])("stops when %s, logged in nowhere", async (_, api, reason) => {
    const base = deps();
    const { parts, store } = deps({ api: { ...base.parts.api, ...api } });
    await logIn("x", parts);
    expect(store.getState().login).toMatchObject({ step: "idle", problem: { reason }, session: { kind: "unknown" } });
  });

  it("stops when the person refuses to sign, posting nothing", async () => {
    const { parts, asked, store } = deps({ sign: () => Promise.resolve({ ok: false, reason: "declined" }) });
    await logIn("x", parts);
    expect(asked.some((line) => line.startsWith("verify"))).toBe(false);
    expect(store.getState().login).toMatchObject({ step: "idle", problem: { reason: "declined" } });
  });

  it("starts no second login while one is under way", async () => {
    const { parts, asked } = deps();
    await Promise.all([logIn("x", parts), logIn("x", parts)]);
    expect(asked.filter((line) => line.startsWith("connect"))).toHaveLength(1);
  });

  it("starts again once the last one ended", async () => {
    const { parts, asked } = deps();
    await logIn("x", parts);
    await logIn("x", parts);
    expect(asked.filter((line) => line.startsWith("connect"))).toHaveLength(2);
  });
});

// F769: a failed /me left the page with no login and no chat until a reload; it is asked again until known.
describe("knowSession", () => {
  // A server that cannot say `failures` times, then names the account; and the waits asked of the page's clock.
  const failing = (failures: number) => {
    const base = deps();
    let tries = 0;
    const made = deps({
      api: {
        ...base.parts.api,
        me: () => {
          tries += 1;
          return Promise.resolve(
            tries <= failures ? { ok: false, reason: "network" } : { ok: true, value: { address: ADDRESS } },
          );
        },
      },
    });
    const waits: number[] = [];
    const wait = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    return { ...made, waits, wait, tries: () => tries };
  };

  it("asks once when the server says at once", async () => {
    const t = failing(0);
    await knowSession(t.parts, t.wait);
    expect(t.waits).toEqual([]);
    expect(t.store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("asks again after each failure, a doubling second apart, 30 at most, until the server says", async () => {
    const t = failing(7);
    await knowSession(t.parts, t.wait);
    expect(t.waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
    expect(t.tries()).toBe(8);
    expect(t.store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("stops asking once a login knew the session meanwhile", async () => {
    const t = failing(5);
    const wait = (ms: number) => {
      t.waits.push(ms);
      t.store.getState().loginActions.signedOut();
      return Promise.resolve();
    };
    await knowSession(t.parts, wait);
    expect(t.tries()).toBe(1);
    expect(t.store.getState().login.session).toEqual({ kind: "out" });
  });

  it("stops after 16 tries while the server cannot say: some five minutes, never forever (O3B)", async () => {
    const t = failing(100);
    await knowSession(t.parts, t.wait);
    expect(t.tries()).toBe(16);
    expect(t.waits).toEqual([1000, 2000, 4000, 8000, 16_000, ...Array.from({ length: 10 }, () => 30_000)]);
    expect(t.store.getState().login.session).toEqual({ kind: "unknown" });
  });

  it("after its tries, rests until the next gesture or return, then asks again at once and every 30 s", async () => {
    const t = failing(20);
    let rests = 0;
    const rest = () => {
      rests += 1;
      return Promise.resolve();
    };
    await knowSession(t.parts, t.wait, rest);
    expect(rests).toBe(1);
    expect(t.tries()).toBe(21);
    expect(t.waits.slice(15)).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(t.store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("rests not when the 16th try finds the session", async () => {
    const t = failing(15);
    let rests = 0;
    const rest = () => {
      rests += 1;
      return Promise.resolve();
    };
    await knowSession(t.parts, t.wait, rest);
    expect([rests, t.tries(), t.waits.length]).toEqual([0, 16, 15]);
    expect(t.store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("rests after the 16th failed try alone; a later round asks every 30 s, no more often than the old endless loop", async () => {
    const t = failing(40);
    const restsAt: number[] = [];
    const rest = () => {
      restsAt.push(t.tries());
      return Promise.resolve();
    };
    await knowSession(t.parts, t.wait, rest);
    const later = (count: number) => Array.from({ length: count }, () => 30_000);
    expect(restsAt).toEqual([16, 32]);
    expect(t.tries()).toBe(41);
    expect(t.waits).toEqual([1000, 2000, 4000, 8000, 16_000, ...later(10), ...later(15), ...later(8)]);
    expect(t.store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("asks no more after its rest when a login knew the session meanwhile", async () => {
    const t = failing(100);
    const rest = () => {
      t.store.getState().loginActions.signedOut();
      return Promise.resolve();
    };
    await knowSession(t.parts, t.wait, rest);
    expect(t.tries()).toBe(16);
    expect(t.store.getState().login.session).toEqual({ kind: "out" });
  });
});

describe("pageClock", () => {
  // A page whose tab is shown or hidden as the test sets it, holding its live listeners as a Document does: a removal takes away only the
  // entry of the same type, function and capture.
  const page = (hidden: boolean) => {
    const entries: { type: string; listener: () => void; capture: boolean }[] = [];
    const captures = (options: boolean | EventListenerOptions | undefined) =>
      typeof options === "boolean" ? options : options?.capture === true;
    const at = (type: string, listener: () => void, capture: boolean) =>
      entries.findIndex((entry) => entry.type === type && entry.listener === listener && entry.capture === capture);
    return {
      hidden,
      addEventListener: (type: string, listener: () => void, options?: boolean | AddEventListenerOptions) => {
        if (at(type, listener, captures(options)) < 0) entries.push({ type, listener, capture: captures(options) });
      },
      removeEventListener: (type: string, listener: () => void, options?: boolean | EventListenerOptions) => {
        const found = at(type, listener, captures(options));
        if (found >= 0) entries.splice(found, 1);
      },
      fire: (type: string) => {
        for (const entry of entries.filter((each) => each.type === type)) entry.listener();
      },
      listening: () => entries.length,
      allCapture: () => entries.every((entry) => entry.capture),
    };
  };
  const isDone = (promise: Promise<void>) => {
    let done = false;
    promise.then(
      () => {
        done = true;
      },
      () => undefined,
    );
    return () => done;
  };
  const turn = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits its time while the tab is shown, and listens to nothing", async () => {
    const shown = page(false);
    const done = isDone(pageClock(shown).wait(1000));
    await vi.advanceTimersByTimeAsync(999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
    expect(shown.listening()).toBe(0);
  });

  it("asks nothing while the tab is hidden: a wait ended hidden lasts until the tab is shown", async () => {
    const hidden = page(true);
    const done = isDone(pageClock(hidden).wait(1000));
    await vi.advanceTimersByTimeAsync(60_000);
    hidden.fire("visibilitychange");
    hidden.fire("pointerdown");
    await turn();
    expect(done()).toBe(false);
    hidden.hidden = false;
    hidden.fire("visibilitychange");
    await turn();
    expect(done()).toBe(true);
    expect(hidden.listening()).toBe(0);
  });

  it("a wait whose tab was hidden in its middle lasts until the tab is shown", async () => {
    const tab = page(false);
    const done = isDone(pageClock(tab).wait(30_000));
    await vi.advanceTimersByTimeAsync(5000);
    tab.hidden = true;
    tab.fire("visibilitychange");
    await vi.advanceTimersByTimeAsync(25_000);
    expect(done()).toBe(false);
    tab.fire("visibilitychange");
    await turn();
    expect(done()).toBe(false);
    tab.hidden = false;
    tab.fire("visibilitychange");
    await turn();
    expect(done()).toBe(true);
    expect(tab.listening()).toBe(0);
  });

  it("a tab hidden and shown again before the wait's end: the wait ends on time", async () => {
    const tab = page(false);
    const done = isDone(pageClock(tab).wait(30_000));
    await vi.advanceTimersByTimeAsync(5000);
    tab.hidden = true;
    tab.fire("visibilitychange");
    await vi.advanceTimersByTimeAsync(5000);
    tab.hidden = false;
    tab.fire("visibilitychange");
    await vi.advanceTimersByTimeAsync(19_999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  });

  it.each(["pointerdown", "wheel", "keydown"])(
    "rests until the next gesture (%s), heard in capture",
    async (gesture) => {
      const shown = page(false);
      const done = isDone(pageClock(shown).rest());
      expect(shown.listening()).toBeGreaterThan(0);
      expect(shown.allCapture()).toBe(true);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(done()).toBe(false);
      shown.fire(gesture);
      await turn();
      expect(done()).toBe(true);
      expect(shown.listening()).toBe(0);
    },
  );

  it("rests until the tab comes back, never at its hiding", async () => {
    const tab = page(false);
    const done = isDone(pageClock(tab).rest());
    tab.hidden = true;
    tab.fire("visibilitychange");
    await turn();
    expect(done()).toBe(false);
    tab.hidden = false;
    tab.fire("visibilitychange");
    await turn();
    expect(done()).toBe(true);
    expect(tab.listening()).toBe(0);
  });

  it("stopped, what was pending never settles and nothing listens, a hidden wait's listener included", async () => {
    const tab = page(true);
    const clock = pageClock(tab);
    const waited = isDone(clock.wait(1000));
    const rested = isDone(clock.rest());
    await vi.advanceTimersByTimeAsync(1000);
    expect(tab.listening()).toBeGreaterThan(0);
    const later = isDone(clock.wait(5000));
    clock.stop();
    expect(tab.listening()).toBe(0);
    tab.hidden = false;
    tab.fire("visibilitychange");
    tab.fire("pointerdown");
    await vi.advanceTimersByTimeAsync(10_000);
    expect([waited(), rested(), later()]).toEqual([false, false, false]);
  });

  it("stop clears every timer, several waits pending", async () => {
    const shown = page(false);
    const clock = pageClock(shown);
    const waits = [isDone(clock.wait(1000)), isDone(clock.wait(30_000)), isDone(clock.rest())];
    clock.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(waits.map((done) => done())).toEqual([false, false, false]);
  });

  it("a wait or a rest asked after stop never settles, arms no timer, adds no listener (a read landing after the page left)", async () => {
    const shown = page(false);
    const clock = pageClock(shown);
    clock.stop();
    const waited = isDone(clock.wait(1000));
    const rested = isDone(clock.rest());
    expect(vi.getTimerCount()).toBe(0);
    expect(shown.listening()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    for (const type of ["pointerdown", "wheel", "keydown", "visibilitychange"]) shown.fire(type);
    await turn();
    expect([waited(), rested()]).toEqual([false, false]);
  });

  describe("with knowSession, a server that never says: the asks it costs", () => {
    const asking = (hidden: boolean) => {
      const base = deps();
      let tries = 0;
      const made = deps({
        api: {
          ...base.parts.api,
          me: () => {
            tries += 1;
            return Promise.resolve({ ok: false, reason: "network" });
          },
        },
      });
      const tab = page(hidden);
      const clock = pageClock(tab);
      const asked = knowSession(made.parts, clock.wait, clock.rest);
      return { tab, clock, asked, tries: () => tries };
    };

    it("16 asks in an hour on a shown tab nobody touches, one rest listening", async () => {
      const t = asking(false);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(t.tries()).toBe(16);
      expect(t.tab.listening()).toBe(4);
      t.clock.stop();
    });

    it("one ask in an hour on a tab hidden from the start; one more when it is shown", async () => {
      const t = asking(true);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(t.tries()).toBe(1);
      t.tab.hidden = false;
      t.tab.fire("visibilitychange");
      t.tab.fire("visibilitychange");
      await turn();
      expect(t.tries()).toBe(2);
      t.clock.stop();
    });

    it("after the 16, a burst of gestures starts one round, never a burst of asks", async () => {
      const t = asking(false);
      await vi.advanceTimersByTimeAsync(3_600_000);
      for (let i = 0; i < 3; i += 1) t.tab.fire("pointerdown");
      await turn();
      expect(t.tries()).toBe(17);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(t.tries()).toBe(17);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.tries()).toBe(18);
      t.clock.stop();
    });
  });
});

describe("readSession", () => {
  it("holds the account the server's cookie names", async () => {
    const { parts, store } = deps();
    await readSession(parts);
    expect(store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("holds nobody when the server knows no session", async () => {
    const base = deps();
    const { parts, store } = deps({
      api: { ...base.parts.api, me: () => Promise.resolve({ ok: true, value: { address: null } }) },
    });
    await readSession(parts);
    expect(store.getState().login.session).toEqual({ kind: "out" });
  });

  it("keeps not knowing when the server cannot say, so the page offers no login it cannot check", async () => {
    const base = deps();
    const { parts, store } = deps({
      api: { ...base.parts.api, me: () => Promise.resolve({ ok: false, reason: "network" }) },
    });
    await readSession(parts);
    expect(store.getState().login.session).toEqual({ kind: "unknown" });
  });
});

describe("logOut", () => {
  it("ends the session on the server, then forgets it", async () => {
    const { parts, asked, store } = deps();
    await logIn("x", parts);
    await logOut(parts);
    expect(asked.at(-1)).toBe("logout");
    expect(store.getState().login.session).toEqual({ kind: "out" });
  });

  // Its cookie, HttpOnly, is the server's to end: shown as out, the session would come back on the next page.
  it("keeps the session when the server cannot be told, and says why, so the person tries again", async () => {
    const base = deps();
    const { parts, store } = deps({
      api: { ...base.parts.api, logout: () => Promise.resolve({ ok: false, reason: "network" }) },
    });
    await logIn("x", parts);
    await logOut(parts);
    expect(store.getState().login).toMatchObject({
      session: { kind: "in", address: ADDRESS },
      problem: { reason: "network" },
    });
  });
});

// D200: only an account change ends the session, with the server's logout as a click's; a network change ends nothing.
describe("endForAccount", () => {
  const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

  it("logs out on the server, once, when Adena is on another account, and the chat link goes off", async () => {
    const { parts, asked, store } = deps();
    await logIn("x", parts);
    store.getState().loginActions.chat("connected");
    await endForAccount(parts, OTHER);
    expect(asked.filter((line) => line === "logout")).toHaveLength(1);
    expect(store.getState().login).toEqual({ session: { kind: "out" }, step: "idle", problem: undefined, chat: "off" });
  });

  it("says why when the server cannot be told: the person is out here, and sees that the cookie still lives", async () => {
    const base = deps();
    const { parts, store } = deps({
      api: { ...base.parts.api, logout: () => Promise.resolve({ ok: false, reason: "network" }) },
    });
    await logIn("x", parts);
    await endForAccount(parts, OTHER);
    expect(store.getState().login).toMatchObject({ session: { kind: "out" }, problem: { reason: "network" } });
  });

  it("does nothing for the same account", async () => {
    const { parts, asked, store } = deps();
    await logIn("x", parts);
    await endForAccount(parts, ADDRESS);
    expect(asked.includes("logout")).toBe(false);
    expect(store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("ends it for an address that is no address too: what Adena says is not trusted", async () => {
    const { parts, asked, store } = deps();
    await logIn("x", parts);
    await endForAccount(parts, "not an address");
    expect(asked.filter((line) => line === "logout")).toHaveLength(1);
    expect(store.getState().login.session).toEqual({ kind: "out" });
  });

  it("leaves a login under way alone", async () => {
    const { parts, asked, store } = deps();
    store.getState().loginActions.begin("signing");
    await endForAccount(parts, OTHER);
    expect(asked).toEqual([]);
    expect(store.getState().login).toMatchObject({ session: { kind: "unknown" }, step: "signing" });
  });

  it("asks the server nothing when nobody is logged in", async () => {
    const { parts, asked } = deps();
    await endForAccount(parts, OTHER);
    expect(asked).toEqual([]);
  });
});

describe("watchAccount", () => {
  // Adena's `On`: the first listener of an event hears it.
  class Wallet {
    registered: { event: string; func: (value: string) => void }[] = [];
    On(event: string, func: (value: string) => void) {
      this.registered.push({ event, func });
    }
    emit(event: string, value: string) {
      this.registered.find((r) => r.event === event)?.func(value);
    }
  }
  // The logout the wiring asked of the server, as a promise: the test waits on it, never on a clock.
  const watched = () => {
    const made = deps();
    const asked = Promise.withResolvers<undefined>();
    const api = {
      ...made.parts.api,
      logout: () => {
        made.asked.push("logout");
        asked.resolve(undefined);
        return Promise.resolve({ ok: true as const, value: undefined });
      },
    };
    const parts = { ...made.parts, api };
    const wallet = new Wallet();
    watchAccount(wallet, { ...parts, listen });
    return { ...made, parts, wallet, logoutAsked: asked.promise };
  };

  it("logs the person out when Adena says another account", async () => {
    const { parts, wallet, logoutAsked, store } = watched();
    await logIn("x", parts);
    wallet.emit("changedAccount", "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    await logoutAsked;
    expect(store.getState().login).toEqual({ session: { kind: "out" }, step: "idle", problem: undefined, chat: "off" });
  });

  it("does nothing when Adena says the same account", async () => {
    const { parts, wallet, asked, store } = watched();
    await logIn("x", parts);
    wallet.emit("changedAccount", ADDRESS);
    expect(asked.includes("logout")).toBe(false);
    expect(store.getState().login.session).toEqual({ kind: "in", address: ADDRESS });
  });

  it("ends nothing on a network change: the person is still logged in, the server is not asked", async () => {
    const { parts, wallet, asked, store } = watched();
    await logIn("x", parts);
    store.getState().loginActions.chat("connected");
    wallet.emit("changedNetwork", "gnoland-1");
    expect(asked.includes("logout")).toBe(false);
    expect(store.getState().login).toMatchObject({ session: { kind: "in", address: ADDRESS }, chat: "connected" });
  });

  it("listens once however many times the page asks", () => {
    const made = deps();
    const wallet = new Wallet();
    for (let i = 0; i < 3; i++) watchAccount(wallet, { ...made.parts, listen });
    expect(wallet.registered).toHaveLength(2);
  });
});
