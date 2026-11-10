// The login's course in the page (slice 4's 4a): Adena read, the server's challenge for its chain, its text
// signed unchanged, the proof posted; each step in the store, each stop with its reason. Its parts come in,
// so the tests give their own: lib's in the page.
import type { connect, signLogin } from "../../lib/adena/adena.ts";
import type { loginApi } from "../../lib/api/login.ts";
import type { createAppStore } from "../../store/index.ts";

export interface LoginDeps {
  connect: typeof connect;
  sign: typeof signLogin;
  api: Pick<ReturnType<typeof loginApi>, "challenge" | "verify" | "me" | "logout">;
  store: ReturnType<typeof createAppStore>;
}

/** Logs in with Adena (window.adena, read as it is): one login at a time, the page's store following it. */
export async function logIn(adena: unknown, { connect, sign, api, store }: LoginDeps): Promise<void> {
  const { begin, stopped, signedIn } = store.getState().loginActions;
  if (store.getState().login.step !== "idle") return;
  begin("wallet");
  const wallet = await connect(adena);
  if (!wallet.ok) {
    stopped(wallet);
    return;
  }
  const challenge = await api.challenge(wallet.chainId);
  if (!challenge.ok) {
    stopped(challenge);
    return;
  }
  begin("signing");
  const signed = await sign(adena, { address: wallet.address, chainId: wallet.chainId, text: challenge.value.text });
  if (!signed.ok) {
    stopped(signed);
    return;
  }
  begin("verifying");
  const verified = await api.verify({ nonce: challenge.value.nonce, address: wallet.address, proof: signed.proof });
  if (verified.ok)
    signedIn(wallet.address); // the api checked the server names this account
  else stopped(verified);
}

/** What the page's start and its logout need of the login's parts: not Adena's, which a login's click asks for. */
export type SessionDeps = Pick<LoginDeps, "api" | "store">;

/** The session the server's cookie holds, read once as the page starts; unknown while it cannot say. */
export async function readSession({ api, store }: SessionDeps): Promise<void> {
  const { signedIn, signedOut } = store.getState().loginActions;
  const me = await api.me();
  if (!me.ok) return;
  if (me.value.address === null) signedOut();
  else signedIn(me.value.address);
}

const FIRST_WAIT_MS = 1000;
const LONGEST_WAIT_MS = 30_000;
// One round's asks: the first, five doublings and ten 30 s waits, some five minutes (O3B, D13978); a later round, after a rest, asks at
// once and then every 30 s, so a tab in use asks no more often than the old endless loop did.
const TRIES = 16;

/** Reads the session until the server says, a doubling second apart, 30 at most: until then the page offers no login and opens no chat.
 * After a round of TRIES it rests (the next gesture or the tab's return) and starts another round; without a rest it ends. Stops
 * once the session is known, by this or by a login meanwhile. */
export async function knowSession(
  deps: SessionDeps,
  wait: (ms: number) => Promise<void>,
  rest?: () => Promise<void>,
): Promise<void> {
  const unknown = () => deps.store.getState().login.session.kind === "unknown";
  for (let first = FIRST_WAIT_MS; unknown(); first = LONGEST_WAIT_MS) {
    for (let tries = 1, ms = first; unknown(); tries += 1, ms = Math.min(ms * 2, LONGEST_WAIT_MS)) {
      await readSession(deps);
      if (tries === TRIES || !unknown()) break;
      await wait(ms);
    }
    if (rest === undefined || !unknown()) return;
    await rest();
  }
}

/** What the page's clock needs of the page: a Document. */
export interface Page {
  readonly hidden: boolean;
  addEventListener(type: string, listener: () => void, options: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options: EventListenerOptions): void;
}

// In capture: a handler stopping a gesture on its way up cannot hide it.
const HEAR: AddEventListenerOptions = { capture: true, passive: true };

/** knowSession's clock in the page: a wait ended while the tab is hidden lasts until it is shown; a rest lasts until the next gesture or
 * the tab's return. `stop` (the page's leaving) clears every timer and listener: what waits, or is asked to after, never settles (a
 * promise of its own each, so a loop stopped there is collected with it). */
export function pageClock(page: Page) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const hearings = new Set<() => void>();
  let stopped = false;
  // Calls `done` at the first of `types` that finds the tab shown, its listeners gone with it.
  const until = (types: readonly string[], done: () => void) => {
    const heard = () => {
      if (page.hidden) return;
      end();
      done();
    };
    const end = () => {
      hearings.delete(end);
      for (const type of types) page.removeEventListener(type, heard, HEAR);
    };
    hearings.add(end);
    for (const type of types) page.addEventListener(type, heard, HEAR);
  };
  return {
    wait: (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (stopped) return;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (page.hidden) until(["visibilitychange"], resolve);
          else resolve();
        }, ms);
        timers.add(timer);
      }),
    rest: (): Promise<void> =>
      new Promise<void>((resolve) => {
        if (!stopped) until(["pointerdown", "wheel", "keydown", "visibilitychange"], resolve);
      }),
    stop: () => {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const end of hearings) end();
    },
  };
}

/** Ends the session on the server, which alone can clear its cookie; kept, with its reason, when it cannot. */
export async function logOut({ api, store }: SessionDeps): Promise<void> {
  const { signedOut, stopped } = store.getState().loginActions;
  const done = await api.logout();
  if (done.ok) signedOut();
  else stopped(done);
}
