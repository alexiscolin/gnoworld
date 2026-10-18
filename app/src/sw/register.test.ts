import { expect, test, vi } from "vitest";
import { startServiceWorker, type WorkerContainer, type WorkerRegistration } from "./register.ts";

type Options = { signal?: AbortSignal } | undefined;

// Listeners of one event as the DOM keeps them: one whose signal has aborted hears nothing more,
// and a listener for any other event name is refused, as the browser would never call it.
function listeners(event: string) {
  const all: { listener: () => void; options: Options }[] = [];
  return {
    add: (type: string, listener: () => void, options: Options) => {
      if (type !== event) throw new Error(`listened to "${type}", not "${event}"`);
      all.push({ listener, options });
    },
    count: () => all.length,
    fire: () => {
      for (const { listener, options } of all) if (options?.signal?.aborted !== true) listener();
    },
  };
}

// A worker as the page sees it: a state that changes, and the messages it was sent.
function worker(state = "installed") {
  const changes = listeners("statechange");
  const sent: unknown[] = [];
  return {
    state,
    sent,
    listening: changes.count,
    postMessage: (message: unknown) => {
      sent.push(message);
    },
    addEventListener: (type: "statechange", listener: () => void, options?: Options) => {
      changes.add(type, listener, options);
    },
    becomes(state: string) {
      this.state = state;
      changes.fire();
    },
  };
}
type Worker = ReturnType<typeof worker>;

// navigator.serviceWorker with one registration, whose waiting and installing workers a test sets.
function container({ controlled = true, waiting = null as Worker | null, installing = null as Worker | null } = {}) {
  const found = listeners("updatefound");
  const changed = listeners("controllerchange");
  const registration = {
    waiting,
    installing,
    addEventListener: (type: "updatefound", listener: () => void, options?: Options) => {
      found.add(type, listener, options);
    },
  } satisfies WorkerRegistration;
  const unregistered: string[] = [];
  const page = {
    controller: controlled ? {} : null,
    register: vi.fn<(url: string) => Promise<typeof registration>>(() => Promise.resolve(registration)),
    getRegistrations: () =>
      Promise.resolve([
        { unregister: () => Promise.resolve(unregistered.push("a") > 0) },
        { unregister: () => Promise.resolve(unregistered.push("b") > 0) },
      ]),
    addEventListener: (type: "controllerchange", listener: () => void, options?: Options) => {
      changed.add(type, listener, options);
    },
  } satisfies WorkerContainer;
  const updateFound = (next: Worker) => {
    registration.installing = next;
    found.fire();
  };
  // The waiting worker takes over: this page's click, or another tab's.
  const takeOver = () => {
    registration.waiting = null;
    changed.fire();
  };
  return { page, registration, unregistered, updateFound, takeOver };
}

function start(
  page: WorkerContainer | undefined,
  { search = "", production = true, signal = new AbortController().signal } = {},
) {
  const updates: (() => void)[] = [];
  const reload = vi.fn();
  const started = startServiceWorker({
    container: page,
    search,
    production,
    signal,
    reload,
    onUpdate: (apply) => updates.push(apply),
  });
  return { started, updates, reload };
}

test("?nosw unregisters every worker and registers none, in production as in development", async () => {
  for (const production of [true, false]) {
    const { page, unregistered } = container();
    await start(page, { search: "?nosw", production }).started;
    expect(unregistered, String(production)).toEqual(["a", "b"]);
    expect(page.register).not.toHaveBeenCalled();
  }
});

test("?nosw among other parameters still unregisters; a parameter that only contains it does not", async () => {
  const among = container();
  await start(among.page, { search: "?lang=fr&nosw" }).started;
  expect(among.unregistered).toEqual(["a", "b"]);
  const longer = container();
  await start(longer.page, { search: "?nosworld=1" }).started;
  expect(longer.unregistered).toEqual([]);
  expect(longer.page.register).toHaveBeenCalledOnce();
});

test("in development no worker registers", async () => {
  const { page, unregistered } = container();
  await start(page, { production: false }).started;
  expect(page.register).not.toHaveBeenCalled();
  expect(unregistered).toEqual([]);
});

test("a browser with no service workers gets none, and no error", async () => {
  await expect(start(undefined).started).resolves.toBeUndefined();
});

test("in production the site's own worker registers once, from the site's root", async () => {
  const { page } = container();
  await start(page).started;
  expect(page.register).toHaveBeenCalledOnce();
  expect(page.register.mock.calls[0]?.[0]).toBe("/sw.js");
});

test("a first worker installs with no prompt: there is no older version to replace", async () => {
  const { page, updateFound } = container({ controlled: false });
  const { started, updates } = start(page);
  await started;
  const first = worker("installing");
  updateFound(first);
  first.becomes("installed");
  expect(updates).toEqual([]);
});

test("a worker already waiting at load shows the prompt, and is told nothing until the click", async () => {
  const waiting = worker();
  const { page } = container({ waiting });
  const { started, updates } = start(page);
  await started;
  expect(updates).toHaveLength(1);
  expect(waiting.sent).toEqual([]);
});

test("a worker still installing at load shows the prompt once it has installed", async () => {
  const installing = worker("installing");
  const { page } = container({ installing });
  const { started, updates } = start(page);
  await started;
  expect(updates).toEqual([]);
  installing.becomes("installed");
  expect(updates).toHaveLength(1);
});

test("a worker found later shows the prompt once installed, once, whatever states follow", async () => {
  const { page, updateFound } = container();
  const { started, updates } = start(page);
  await started;
  const next = worker("installing");
  updateFound(next);
  expect(updates).toEqual([]);
  next.becomes("installed");
  next.becomes("activating");
  next.becomes("redundant");
  expect(updates).toHaveLength(1);
  expect(next.sent).toEqual([]);
});

test("a worker waiting while a newer one installs: both are offered, and the click goes to the one waiting then", async () => {
  const older = worker();
  const newer = worker("installing");
  const { page, registration } = container({ waiting: older, installing: newer });
  const { started, updates } = start(page);
  await started;
  expect(updates).toHaveLength(1);
  // The newer one installs: the browser sets the older one aside, and the newer one waits.
  registration.installing = null;
  registration.waiting = newer;
  older.becomes("redundant");
  newer.becomes("installed");
  expect(updates).toHaveLength(2);
  updates[0]?.();
  expect(older.sent).toEqual([]);
  expect(newer.sent).toEqual([{ type: "SKIP_WAITING" }]);
});

test("a worker that fails to install shows no prompt", async () => {
  const { page, updateFound } = container();
  const { started, updates } = start(page);
  await started;
  const next = worker("installing");
  updateFound(next);
  next.becomes("redundant");
  expect(updates).toEqual([]);
});

test("the prompt's action asks the waiting worker to take over, then reloads once it has", async () => {
  const waiting = worker();
  const { page, takeOver } = container({ waiting });
  const { started, updates, reload } = start(page);
  await started;
  updates[0]?.();
  expect(waiting.sent).toEqual([{ type: "SKIP_WAITING" }]);
  expect(reload).not.toHaveBeenCalled();
  takeOver();
  takeOver();
  expect(reload).toHaveBeenCalledOnce();
});

test("another tab's update takes over this page without reloading it; this page's click then reloads", async () => {
  const waiting = worker();
  const { page, takeOver } = container({ waiting });
  const { started, updates, reload } = start(page);
  await started;
  takeOver();
  expect(reload).not.toHaveBeenCalled();
  updates[0]?.();
  expect(reload).toHaveBeenCalledOnce();
  expect(waiting.sent).toEqual([]);
});

test("once the page has gone (its signal aborted), no update shows a prompt, nor is even watched", async () => {
  const leaving = new AbortController();
  const { page, updateFound } = container();
  const { started, updates } = start(page, { signal: leaving.signal });
  await started;
  leaving.abort();
  const next = worker("installing");
  updateFound(next);
  expect(next.listening()).toBe(0);
  next.becomes("installed");
  expect(updates).toEqual([]);
});

test("a second click before the takeover sends nothing more, and the page reloads once", async () => {
  const waiting = worker();
  const { page, takeOver } = container({ waiting });
  const { started, updates, reload } = start(page);
  await started;
  updates[0]?.();
  updates[0]?.();
  takeOver();
  expect(waiting.sent).toEqual([{ type: "SKIP_WAITING" }]);
  expect(reload).toHaveBeenCalledOnce();
});

test("a page gone between the found update and its install shows no prompt", async () => {
  const leaving = new AbortController();
  const { page, updateFound } = container();
  const { started, updates } = start(page, { signal: leaving.signal });
  await started;
  const next = worker("installing");
  updateFound(next);
  leaving.abort();
  next.becomes("installed");
  expect(updates).toEqual([]);
});

test("a page gone after the click, before the takeover, does not reload", async () => {
  const leaving = new AbortController();
  const { page, takeOver } = container({ waiting: worker() });
  const { started, updates, reload } = start(page, { signal: leaving.signal });
  await started;
  updates[0]?.();
  leaving.abort();
  takeOver();
  expect(reload).not.toHaveBeenCalled();
});

test("a page gone before its registration answered shows no prompt", async () => {
  const leaving = new AbortController();
  const { page } = container({ waiting: worker() });
  const { started, updates } = start(page, { signal: leaving.signal });
  leaving.abort();
  await started;
  expect(updates).toEqual([]);
});

test("a registration that fails rejects, so the error rises", async () => {
  const { page } = container();
  page.register.mockRejectedValueOnce(new Error("no worker here"));
  await expect(start(page).started).rejects.toThrow("no worker here");
});
