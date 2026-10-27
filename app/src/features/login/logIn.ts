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

/** Reads the session until the server says, a doubling second apart, 30 at most: until then the page offers no
 * login and opens no chat. Stops once the session is known, by this or by a login meanwhile. */
export async function knowSession(deps: SessionDeps, wait: (ms: number) => Promise<void>): Promise<void> {
  const unknown = () => deps.store.getState().login.session.kind === "unknown";
  for (let ms = FIRST_WAIT_MS; unknown(); ms = Math.min(ms * 2, LONGEST_WAIT_MS)) {
    await readSession(deps);
    if (unknown()) await wait(ms);
  }
}

/** Ends the session on the server, which alone can clear its cookie; kept, with its reason, when it cannot. */
export async function logOut({ api, store }: SessionDeps): Promise<void> {
  const { signedOut, stopped } = store.getState().loginActions;
  const done = await api.logout();
  if (done.ok) signedOut();
  else stopped(done);
}
