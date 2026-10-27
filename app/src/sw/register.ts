// The page's side of the worker (ADR-0001 §12): none in development, and `?nosw` removes any. An
// update shows a prompt and waits for the click; the page then reloads once the new worker has
// taken over. The browser's objects are parameters, so the tests can play them.
import { TAKE_OVER } from "./worker.ts";

// Every listener goes with the page: one without its signal would outlive it.
interface Listening {
  readonly signal: AbortSignal;
}

interface PageWorker {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void, options: Listening): void;
}

export interface WorkerRegistration {
  readonly waiting: PageWorker | null;
  readonly installing: PageWorker | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void, options: Listening): void;
}

export interface WorkerContainer {
  readonly controller: unknown;
  register(url: string): Promise<WorkerRegistration>;
  getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]>;
  addEventListener(type: "controllerchange", listener: () => void, options: Listening): void;
}

interface Shown {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void, options: Listening): void;
}

interface Start {
  readonly container: WorkerContainer | undefined;
  readonly document: Shown;
  readonly search: string;
  readonly production: boolean;
  readonly signal: AbortSignal;
  readonly reload: () => void;
  readonly report: (error: unknown) => void;
  /** Whether the host answers for the worker's script: a fetch of it that cannot reach the host,
   * offline or on a network with no way out, is expected of an installed app (F343, F351). */
  readonly reachable: () => Promise<boolean>;
  readonly onUpdate: (apply: () => void) => void;
}

/** Whether the host answers for the worker's script: any response is one, an error status included. */
export const hostAnswers = () =>
  fetch("/sw.js", { method: "HEAD", cache: "no-store" }).then(
    () => true,
    () => false,
  );

export async function startServiceWorker(start: Start): Promise<void> {
  const { container, signal } = start;
  if (container === undefined) return;
  if (new URLSearchParams(start.search).has("nosw")) {
    await Promise.all((await container.getRegistrations()).map((registration) => registration.unregister()));
    return;
  }
  if (!start.production) return;
  const registration = await container.register("/sw.js").catch(async (error: unknown) => {
    if (await start.reachable()) throw error;
    return null;
  });
  if (registration === null || signal.aborted) return;
  // One page reloads once, however many clicks and takeovers it sees.
  let clicked = false;
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    start.reload();
  };
  // The click goes to the worker waiting then (a newer one may have set aside the one offered, F380), and every
  // click sends the message: one may be lost, and the page cannot tell (F679).
  const apply = () => {
    const waiting = registration.waiting;
    // Another tab's click may have made it active already: there is nothing left to wait for.
    if (waiting === null) {
      reloadOnce();
      return;
    }
    // Added at each click, the browser keeps it once; a first install's takeover, unasked, reloads nothing.
    container.addEventListener("controllerchange", reloadOnce, { signal });
    clicked = true;
    waiting.postMessage(TAKE_OVER);
  };
  // The first worker replaces no version, so it needs no prompt.
  const offer = () => {
    if (container.controller !== null) start.onUpdate(apply);
  };
  const watch = (next: PageWorker) => {
    next.addEventListener(
      "statechange",
      () => {
        if (next.state === "installed") offer();
      },
      { signal },
    );
  };
  // The browser looks for a new worker when a page loads; one kept open for days moves in place,
  // so it asks each time it is shown again. The notice closes on its click: a page whose click took
  // nothing over (the message lost) is offered the update again, for its next click to send it again.
  start.document.addEventListener(
    "visibilitychange",
    () => {
      if (start.document.visibilityState !== "visible") return;
      if (clicked && registration.waiting !== null) offer();
      registration.update().catch(async (error: unknown) => {
        if (await start.reachable()) start.report(error);
      });
    },
    { signal },
  );
  if (registration.waiting !== null) offer();
  if (registration.installing !== null) watch(registration.installing);
  registration.addEventListener(
    "updatefound",
    () => {
      if (registration.installing !== null) watch(registration.installing);
    },
    { signal },
  );
}
