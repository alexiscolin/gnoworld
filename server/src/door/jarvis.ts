// The door's client of jarvis (D42, D94): one HTTP call a question, a translation or a digest (10k) to the address a
// setting names, on the network only
// the two share, through the server's one way out (net.ts) with its own timeout, longer than the loop's worst, and
// stopped with the request that asked. It forwards no session, no cookie and no account. What comes back is read up to
// 1 MiB and parsed with the client's own schema before anything passes it on; a failure is a value, never a hang.
import {
  JARVIS_PATHS,
  JarvisAnswer,
  JarvisBudgets,
  JarvisMadeDigest,
  JarvisTranslation,
  type JarvisAsk,
  type JarvisBudget,
  type JarvisDigestRequest,
  type JarvisTranslate,
} from "@gnoworld/schemas";
import { readJson, send as netSend, type Send } from "@gnoworld/service/net";

export type Failure = "down" | "slow" | "failed" | "shape" | "gone" | "refused";
type Called<T> = { ok: true; value: T } | { ok: false; error: Failure };
interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

type Answered<A> = { ok: true; answer: A } | { ok: false; error: Failure };
type Budgeted = { ok: true; budgets: JarvisBudgets } | { ok: false; error: Failure };

export interface Jarvis {
  ask: (request: JarvisAsk, signal: AbortSignal) => Promise<Answered<JarvisAnswer>>;
  translate: (request: JarvisTranslate, signal: AbortSignal) => Promise<Answered<JarvisTranslation>>;
  digest: (request: JarvisDigestRequest, signal: AbortSignal) => Promise<Answered<JarvisMadeDigest>>;
  budgets: () => Promise<Budgeted>;
  setBudget: (change: JarvisBudget) => Promise<Budgeted>;
}

const MAX_BYTES = 1024 * 1024;
// A budget is read or changed by one SQLite statement: ten seconds is a jarvis that does not answer.
const BUDGETS_MS = 10_000;

// Why a call that threw failed: the request that asked gone, its own time out, or nothing that answered; a call answered
// with no success failed, or was refused.
function failureOf(error: unknown, signal: AbortSignal | undefined): Failure {
  if (signal?.aborted === true) return "gone";
  return error instanceof Error && error.name === "TimeoutError" ? "slow" : "down";
}

// The answer's value, or a failure: JSON of another shape, text that is no JSON or one too long.
function parsed<T>(schema: Schema<T>, json: unknown): Called<T> {
  const checked = schema.safeParse(json);
  return checked.success ? { ok: true, value: checked.data } : { ok: false, error: "shape" };
}

export function jarvisClient({
  url,
  timeoutMs,
  send = netSend,
}: {
  url: string;
  timeoutMs: number;
  send?: Send;
}): Jarvis {
  const call = async <T>(
    schema: Schema<T>,
    path: string,
    { body, signal, ms }: { body?: unknown; signal?: AbortSignal; ms: number },
  ): Promise<Called<T>> => {
    const init: RequestInit =
      body === undefined
        ? { method: "GET", headers: { accept: "application/json" } }
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    try {
      const response = await send(`${url}${path}`, { ...init, signal: signal ?? null }, ms);
      const json = await readJson(response, MAX_BYTES);
      if (response.ok) return parsed(schema, json);
      // jarvis refuses what its schemas refuse (400): the asker's request, never jarvis's failure.
      return { ok: false, error: response.status === 400 ? "refused" : "failed" };
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
    ask: (body, signal) => posted(JarvisAnswer, JARVIS_PATHS.ask, { body, signal }),
    translate: (body, signal) => posted(JarvisTranslation, JARVIS_PATHS.translate, { body, signal }),
    digest: (body, signal) => posted(JarvisMadeDigest, JARVIS_PATHS.digest, { body, signal }),
    budgets: async () => budgets(await call(JarvisBudgets, JARVIS_PATHS.budgets, { ms: BUDGETS_MS })),
    setBudget: async (change) =>
      budgets(await call(JarvisBudgets, JARVIS_PATHS.budgets, { body: change, ms: BUDGETS_MS })),
  };
}
