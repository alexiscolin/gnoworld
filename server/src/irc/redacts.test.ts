import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRedacts } from "./redacts.ts";
import { forget, fresh, sentOn } from "./session.ts";

afterEach(() => {
  vi.useRealTimers();
});

// The hides the link sent and Ergo has not taken (F2462), driven without a socket: time is the test's.
const HIDE = ["#bubble", "m1", "a word this world bans"] as const;
const BASE = 10;
const setup = () => {
  vi.useFakeTimers();
  const redacts = makeRedacts();
  const send = vi.fn<(params: readonly string[]) => void>();
  const gaveUp = vi.fn<() => void>();
  const again = { send, ms: BASE, gaveUp };
  return { redacts, send, gaveUp, again };
};

describe("the hides waiting for Ergo's word", () => {
  it("asks again after the first wait, then after twice that, then four times (F2651)", () => {
    const { redacts, send, again } = setup();
    redacts.sent(HIDE);
    redacts.unknown("#bubble", "m1", again);
    vi.advanceTimersByTime(BASE - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(HIDE);
    redacts.unknown("#bubble", "m1", again);
    vi.advanceTimersByTime(2 * BASE - 1);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gives up once after six asks, and asks no more (F2652)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.sent(HIDE);
    for (let i = 0; i < 6; i++) {
      redacts.unknown("#bubble", "m1", again);
      vi.advanceTimersByTime(BASE * 2 ** i);
    }
    expect(send).toHaveBeenCalledTimes(6);
    expect(gaveUp).not.toHaveBeenCalled();
    redacts.unknown("#bubble", "m1", again);
    expect(gaveUp).toHaveBeenCalledTimes(1);
    // The entry is gone: a refusal after that is not ours to answer, nor reported twice.
    redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(gaveUp).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(6);
  });

  it("starts the count anew for a hide sent again after it gave up (F2655)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.sent(HIDE);
    for (let i = 0; i < 7; i++) {
      redacts.unknown("#bubble", "m1", again);
      vi.runAllTimers();
    }
    expect(gaveUp).toHaveBeenCalledTimes(1);
    send.mockClear();
    redacts.sent(HIDE);
    redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps its count when the same hide is sent again while it waits (F2655)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.sent(HIDE);
    for (let i = 0; i < 6; i++) {
      redacts.unknown("#bubble", "m1", again);
      vi.runAllTimers();
      // The retry itself goes through the link, which reports it as sent.
      redacts.sent(HIDE);
    }
    expect(send).toHaveBeenCalledTimes(6);
    redacts.unknown("#bubble", "m1", again);
    expect(gaveUp).toHaveBeenCalledTimes(1);
  });

  it("arms one timer for two refusals of one ask (F2655)", () => {
    const { redacts, send, again } = setup();
    redacts.sent(HIDE);
    redacts.unknown("#bubble", "m1", again);
    redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores a refusal about a hide it never sent, and does not report it (F2655)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.unknown("#bubble", "m9", again);
    redacts.sent(HIDE);
    redacts.unknown("#other", "m1", again);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    expect(gaveUp).not.toHaveBeenCalled();
  });

  it("cancels the ask waiting when Ergo takes the hide or refuses it for good (F2654)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.sent(HIDE);
    redacts.unknown("#bubble", "m1", again);
    redacts.done("#bubble", "m1");
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    // And the line is forgotten: a late refusal arms nothing.
    redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    expect(gaveUp).not.toHaveBeenCalled();
  });

  it("lets go of the oldest hide past its bound, its timer cancelled (F2655)", () => {
    const { redacts, send, again } = setup();
    redacts.sent(["#bubble", "first"]);
    redacts.unknown("#bubble", "first", again);
    for (let i = 0; i < 1000; i++) redacts.sent(["#bubble", `n${String(i)}`]);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    redacts.unknown("#bubble", "first", again);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    // The second oldest is still waited for.
    redacts.unknown("#bubble", "n0", again);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps every hide up to its bound (F2655)", () => {
    const { redacts, send, again } = setup();
    redacts.sent(["#bubble", "first"]);
    for (let i = 0; i < 999; i++) redacts.sent(["#bubble", `n${String(i)}`]);
    redacts.unknown("#bubble", "first", again);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("forgets everything and cancels every timer when its connection ends (F2655)", () => {
    const { redacts, send, gaveUp, again } = setup();
    redacts.sent(HIDE);
    redacts.unknown("#bubble", "m1", again);
    redacts.clear();
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(send).not.toHaveBeenCalled();
    expect(gaveUp).not.toHaveBeenCalled();
  });
});

describe("the hides waiting, across a connection's end", () => {
  it("forgets a spent hide at the connection's end, so the same line hidden on the next one is asked anew (F2655)", () => {
    vi.useFakeTimers();
    const state = fresh(1000, 1000);
    const send = vi.fn<(params: readonly string[]) => void>();
    const gaveUp = vi.fn<() => void>();
    const again = { send, ms: BASE, gaveUp };
    sentOn(state, "REDACT", HIDE);
    for (let i = 0; i < 6; i++) {
      state.redacts.unknown("#bubble", "m1", again);
      vi.runAllTimers();
    }
    forget(state);
    send.mockClear();
    sentOn(state, "REDACT", HIDE);
    state.redacts.unknown("#bubble", "m1", again);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
    expect(gaveUp).not.toHaveBeenCalled();
  });
});
