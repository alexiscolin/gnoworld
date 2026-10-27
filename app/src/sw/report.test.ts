import { expect, test, vi } from "vitest";
import { reportViolations, VIOLATION } from "./report.ts";

interface Violation {
  effectiveDirective: string;
  blockedURI: string;
}

// A worker's global scope with the one event the report listens to, and the pages it can reach.
function worker({ pages = 2, listing = true } = {}) {
  const heard: { type: string; listener: (event: Violation) => void }[] = [];
  const sent: unknown[][] = Array.from({ length: pages }, () => []);
  const asked: unknown[] = [];
  return {
    scope: {
      clients: {
        matchAll: (options: { type: "window"; includeUncontrolled: true }) => {
          asked.push(options);
          return listing
            ? Promise.resolve(sent.map((messages) => ({ postMessage: (message: unknown) => messages.push(message) })))
            : Promise.reject(new Error("no clients"));
        },
      },
      addEventListener: (type: "securitypolicyviolation", listener: (event: Violation) => void) => {
        heard.push({ type, listener });
      },
    },
    violate: (effectiveDirective: string, blockedURI = "https://evil.test/x") => {
      for (const { listener } of heard) listener({ effectiveDirective, blockedURI });
    },
    sent,
    asked,
    heard,
  };
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// F468: the page's journeys listen for these messages; a worker's violation is invisible to them otherwise.
test("a policy violation inside the worker is told to every open page, with the directive it broke and what it blocked", async () => {
  const { scope, violate, heard, sent, asked } = worker();
  reportViolations(scope, vi.fn());
  expect(heard.map(({ type }) => type)).toEqual(["securitypolicyviolation"]);
  violate("connect-src", "https://evil.test/x");
  violate("script-src-elem", "inline");
  await settled();
  const told = [
    { type: VIOLATION, directive: "connect-src", blockedURI: "https://evil.test/x" },
    { type: VIOLATION, directive: "script-src-elem", blockedURI: "inline" },
  ];
  expect(sent).toEqual([told, told]);
  // Pages the worker does not control yet (a first visit) are told as well.
  expect(asked).toEqual([
    { type: "window", includeUncontrolled: true },
    { type: "window", includeUncontrolled: true },
  ]);
});

test("the message type is the one the journeys' page side listens for: csp-violation", () => {
  expect(VIOLATION).toBe("csp-violation");
});

test("nothing is told until a violation happens", async () => {
  const { scope, sent, asked } = worker();
  reportViolations(scope, vi.fn());
  await settled();
  expect(asked).toEqual([]);
  expect(sent).toEqual([[], []]);
});

test("with no page open nothing is sent and nothing fails", async () => {
  const { scope, violate } = worker({ pages: 0 });
  const fail = vi.fn();
  reportViolations(scope, fail);
  violate("connect-src");
  await settled();
  expect(fail).not.toHaveBeenCalled();
});

test("pages the worker cannot list are not silent: the failure is reported, not swallowed", async () => {
  const { scope, violate } = worker({ listing: false });
  const fail = vi.fn();
  reportViolations(scope, fail);
  violate("connect-src");
  await settled();
  expect(fail).toHaveBeenCalledOnce();
  expect(fail.mock.calls[0]?.[0]).toEqual(new Error("no clients"));
});
