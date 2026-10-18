// The page's side of the worker (ADR-0001 §12): none in development, and `?nosw` removes any. An
// update shows a prompt and waits for the click; the page then reloads once the new worker has
// taken over. The browser's objects are parameters, so the tests can play them.

interface Listening {
  signal?: AbortSignal;
}

interface PageWorker {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void, options?: Listening): void;
}

export interface WorkerRegistration {
  readonly waiting: PageWorker | null;
  readonly installing: PageWorker | null;
  addEventListener(type: "updatefound", listener: () => void, options?: Listening): void;
}

export interface WorkerContainer {
  readonly controller: unknown;
  register(url: string): Promise<WorkerRegistration>;
  getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]>;
  addEventListener(type: "controllerchange", listener: () => void, options?: Listening): void;
}

export interface Start {
  readonly container: WorkerContainer | undefined;
  readonly search: string;
  readonly production: boolean;
  readonly signal: AbortSignal;
  readonly reload: () => void;
  readonly onUpdate: (apply: () => void) => void;
}

export async function startServiceWorker(start: Start): Promise<void> {
  const { container, signal } = start;
  if (container === undefined) return;
  if (new URLSearchParams(start.search).has("nosw")) {
    await Promise.all((await container.getRegistrations()).map((registration) => registration.unregister()));
    return;
  }
  if (!start.production) return;
  const registration = await container.register("/sw.js");
  if (signal.aborted) return;
  // One page reloads once, however many clicks and takeovers it sees.
  let asked = false;
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    start.reload();
  };
  const apply = (next: PageWorker) => () => {
    // Another tab's click may have made it active already: there is nothing left to wait for.
    if (registration.waiting === null) {
      reloadOnce();
      return;
    }
    if (asked) return;
    asked = true;
    container.addEventListener("controllerchange", reloadOnce, { signal });
    next.postMessage({ type: "SKIP_WAITING" });
  };
  // The first worker replaces no version, so it needs no prompt.
  const offer = (next: PageWorker) => {
    if (container.controller !== null) start.onUpdate(apply(next));
  };
  const watch = (next: PageWorker) => {
    next.addEventListener(
      "statechange",
      () => {
        if (next.state === "installed") offer(next);
      },
      { signal },
    );
  };
  if (registration.waiting !== null) offer(registration.waiting);
  else if (registration.installing !== null) watch(registration.installing);
  registration.addEventListener(
    "updatefound",
    () => {
      if (registration.installing !== null) watch(registration.installing);
    },
    { signal },
  );
}
