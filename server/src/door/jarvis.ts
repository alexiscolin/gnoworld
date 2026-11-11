// The door's client of jarvis (D42, D94): one HTTP call a question, a translation or a digest (10k) to the address a
// setting names, on the network only
// the two share, through the server's one way out (net.ts) with its own timeout, longer than the loop's worst, and
// stopped with the request that asked. It forwards no session, no cookie and no account. What comes back is read up to
// 1 MiB and parsed with the client's own schema before anything passes it on; a failure is a value, never a hang.
import {
  JARVIS_KEY_HEADER,
  JARVIS_PATHS,
  JarvisBudgets,
  JarvisMadeDigest,
  JarvisPaidAnswer,
  JarvisTranslation,
  type JarvisAsk,
  type JarvisBudget,
  type JarvisDigestRequest,
  type JarvisTranslate,
} from "@gnoworld/schemas";
import { readJson, send as netSend, type Send } from "@gnoworld/service/net";
import type { Secret } from "@gnoworld/service/settings";

export type Failure = "down" | "lost" | "slow" | "failed" | "shape" | "gone" | "refused";

// What a status jarvis answers with means, any other its failure: what its schemas refuse is the asker's request (400),
// a jarvis starting or draining is not ready (503, D93), one past its own time slow (504) (F5314).
function failureOfStatus(status: number): Failure {
  switch (status) {
    case 400:
      return "refused";
    case 503:
      return "down";
    case 504:
      return "slow";
    default:
      return "failed";
  }
}
type Called<T> = { ok: true; value: T } | { ok: false; error: Failure };
interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

type Answered<A> = { ok: true; answer: A } | { ok: false; error: Failure };
type Budgeted = { ok: true; budgets: JarvisBudgets } | { ok: false; error: Failure };

export interface Jarvis {
  ask: (request: JarvisAsk, signal: AbortSignal) => Promise<Answered<JarvisPaidAnswer>>;
  translate: (request: JarvisTranslate, signal: AbortSignal) => Promise<Answered<JarvisTranslation>>;
  digest: (request: JarvisDigestRequest, signal: AbortSignal) => Promise<Answered<JarvisMadeDigest>>;
  budgets: () => Promise<Budgeted>;
  setBudget: (change: JarvisBudget) => Promise<Budgeted>;
}

const MAX_BYTES = 1024 * 1024;
// A budget is read or changed by one SQLite statement: ten seconds is a jarvis that does not answer.
const BUDGETS_MS = 10_000;

// Why a call that threw failed: the request that asked gone, its own time out, or a connection lost or refused (`lost`,
// told from a jarvis that answers 503, `down`); a call answered with no success failed, or was refused.
function failureOf(error: unknown, signal: AbortSignal | undefined): Failure {
  if (signal?.aborted === true) return "gone";
  return error instanceof Error && error.name === "TimeoutError" ? "slow" : "lost";
}

// The answer's value, or a failure: JSON of another shape, text that is no JSON or one too long.
function parsed<T>(schema: Schema<T>, json: unknown): Called<T> {
  const checked = schema.safeParse(json);
  return checked.success ? { ok: true, value: checked.data } : { ok: false, error: "shape" };
}

export function jarvisClient({
  url,
  timeoutMs,
  key,
  send = netSend,
}: {
  url: string;
  timeoutMs: number;
  // Sent in a header of every request; none when jarvis is run without one.
  key?: Secret | undefined;
  send?: Send;
}): Jarvis {
  const call = async <T>(
    schema: Schema<T>,
    path: string,
    { body, signal, ms }: { body?: unknown; signal?: AbortSignal; ms: number },
  ): Promise<Called<T>> => {
    const proof = key === undefined ? {} : { [JARVIS_KEY_HEADER]: key.reveal() };
    const init: RequestInit =
      body === undefined
        ? { method: "GET", headers: { accept: "application/json", ...proof } }
        : { method: "POST", headers: { "content-type": "application/json", ...proof }, body: JSON.stringify(body) };
    try {
      const response = await send(`${url}${path}`, { ...init, signal: signal ?? null }, ms);
      const json = await readJson(response, MAX_BYTES);
      if (response.ok) return parsed(schema, json);
      return { ok: false, error: failureOfStatus(response.status) };
    } catch (error) {
      return { ok: false, error: failureOf(error, signal) };
    }
  };
  const budgets = (called: Called<JarvisBudgets>): Budgeted =>
    called.ok ? { ok: true, budgets: called.value } : called;
  // A POST that waits as long as a question may take, stopped with the request that asked.
  const posted = async <T>(
    schema: Schema<T>,
    path: string,
    { body, signal }: { body: unknown; signal: AbortSignal },
  ): Promise<Answered<T>> => {
    const called = await call(schema, path, { body, signal, ms: timeoutMs });
    return called.ok ? { ok: true, answer: called.value } : called;
  };
  return {
    ask: (body, signal) => posted(JarvisPaidAnswer, JARVIS_PATHS.ask, { body, signal }),
    translate: (body, signal) => posted(JarvisTranslation, JARVIS_PATHS.translate, { body, signal }),
    digest: (body, signal) => posted(JarvisMadeDigest, JARVIS_PATHS.digest, { body, signal }),
    budgets: async () => budgets(await call(JarvisBudgets, JARVIS_PATHS.budgets, { ms: BUDGETS_MS })),
    setBudget: async (change) =>
      budgets(await call(JarvisBudgets, JARVIS_PATHS.budgets, { body: change, ms: BUDGETS_MS })),
  };
}
