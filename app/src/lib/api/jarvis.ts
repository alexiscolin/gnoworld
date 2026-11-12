// The browser's client of the door's Jarvis routes (server/src/door/state.ts and ask.ts, under /api/jarvis), through the one JSON
// call of lib/api/http.ts. Every answer is read through its schema: one off it, a 401, a 500 or a timeout is a failure the panel
// shows as `off`, never a retry.
import { ASK_WAIT_S, JarvisAnswer, JarvisQuestion, JarvisTranslateRequest, JarvisTranslation } from "@gnoworld/schemas";
import { jsonCall, type Fetcher, type Result } from "./http.ts";

/** The most code points a person's own question holds (D13986); the server's cap is higher and its own. */
export const QUESTION_CHARS = 500;
// The door waits for jarvis up to ASK_WAIT_S.door and keeps the call whatever the page does: the page waits 10 s longer, so a slow answer is not lost.
const ASK_MS = ASK_WAIT_S.page * 1000;

/** A text's length in code points, as the server counts a question. */
export const pointsOf = (text: string): number => Array.from(text).length;

const tooLong = (question: JarvisQuestion): boolean =>
  "question" in question && pointsOf(question.question) > QUESTION_CHARS;

export function jarvisApi(fetcher: Fetcher, timeoutMs?: number) {
  const ask = jsonCall(fetcher, timeoutMs ?? ASK_MS);
  const translation = jsonCall(fetcher, timeoutMs);
  return {
    /** A question or a fixed ask; one off the schema or too long is refused here, before anything is sent. */
    ask: (question: JarvisQuestion): Promise<Result<JarvisAnswer>> =>
      !JarvisQuestion.safeParse(question).success || tooLong(question)
        ? Promise.resolve({ ok: false, reason: "malformed" })
        : ask({ path: "/api/jarvis/ask", body: question, schema: JarvisAnswer }),
    /** A room's line in a language (the door's /api/jarvis/translate): the line by its id, never its text. */
    translate: (request: JarvisTranslateRequest): Promise<Result<JarvisTranslation>> =>
      !JarvisTranslateRequest.safeParse(request).success
        ? Promise.resolve({ ok: false, reason: "malformed" })
        : translation({ path: "/api/jarvis/translate", body: request, schema: JarvisTranslation }),
  };
}

// An ask waits minutes for its answer: on the page's per-host gate it would hold one of the four own-origin slots, and four asks stop every read.
/** The Jarvis client of this page, on a fetch of its own, outside the gate. */
export const pageJarvisApi = () => jarvisApi((url, init) => fetch(url, init));
