// A policy violation inside the worker (F468): the worker's own global scope hears it, where the page's listener
// never runs. It tells the open pages, which alone can write to the app's error channel; the journeys' fixture
// is the listener for now (tests/e2e/fixtures.ts), the logger's to be (lint/app.config.ts: console nowhere).
export const VIOLATION = "csp-violation";

interface Violating {
  readonly clients: {
    matchAll(options: {
      type: "window";
      includeUncontrolled: true;
    }): Promise<readonly { postMessage(message: unknown): void }[]>;
  };
  addEventListener(
    type: "securitypolicyviolation",
    listener: (event: { effectiveDirective: string; blockedURI: string }) => void,
  ): void;
}

export function reportViolations(scope: Violating, fail: (error: unknown) => void): void {
  scope.addEventListener("securitypolicyviolation", (event) => {
    const { effectiveDirective: directive, blockedURI } = event;
    scope.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pages) => {
      for (const page of pages) page.postMessage({ type: VIOLATION, directive, blockedURI });
    }, fail);
  });
}
