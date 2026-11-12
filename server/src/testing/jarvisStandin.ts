// A stand-in for jarvis, for the workshop's demo: the same paths and bodies (JARVIS_PATHS, each answer its schema), with no model, no key
// and no network. An ask is answered from prepared texts chosen by the question's words; nothing here is a live figure, so an answer that
// needs one proposes the call or points to the plate that shows it. Translations are prepared for the demo's scripted lines.
import { createServer, type IncomingMessage, type Server } from "node:http";
import {
  JARVIS_KEY_HEADER,
  JARVIS_PATHS,
  JarvisAsk,
  JarvisBudget,
  JarvisDigestRequest,
  JarvisExplainRequest,
  JarvisTranslate,
  type JarvisBudgets,
  type JarvisExplained,
  type JarvisPaidAnswer,
} from "@gnoworld/schemas";
import { answerOf, DIGEST, translated } from "./jarvisStandinAnswers.ts";

const BUDGETS: JarvisBudgets = { ask: 5, translate: 5 };
const OFF: JarvisExplained = { status: "off" };
const REFUSED = { error: "refused" };

// What each POST path answers to a body its schema reads; none for a body it refuses.
const POSTS: Record<string, (body: unknown) => unknown> = {
  [JARVIS_PATHS.ask]: (body) => {
    const ask = JarvisAsk.safeParse(body);
    if (!ask.success) return undefined;
    const { markdown, buttons = [] } = answerOf(ask.data);
    return { status: "answered", markdown, buttons, cost: 0 } satisfies JarvisPaidAnswer;
  },
  [JARVIS_PATHS.translate]: (body) => {
    const asked = JarvisTranslate.safeParse(body);
    return asked.success ? translated(asked.data) : undefined;
  },
  [JARVIS_PATHS.digest]: (body) => (JarvisDigestRequest.safeParse(body).success ? DIGEST : undefined),
  [JARVIS_PATHS.explain]: (body) => (JarvisExplainRequest.safeParse(body).success ? OFF : undefined),
  [JARVIS_PATHS.budgets]: (body) => {
    const change = JarvisBudget.safeParse(body);
    if (!change.success) return undefined;
    BUDGETS[change.data.budget] = change.data.dollars;
    return BUDGETS;
  },
};

async function read(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  try {
    return text === "" ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Starts the stand-in on 127.0.0.1 at a free port; it answers only a request carrying `key` in the door's header. */
export async function startStandin(key: string): Promise<{ url: string; stop: () => Promise<void> }> {
  const answer = async (request: IncomingMessage): Promise<[number, unknown]> => {
    if (request.headers[JARVIS_KEY_HEADER] !== key) return [401, REFUSED];
    const path = request.url ?? "";
    if (request.method === "GET" && path === JARVIS_PATHS.budgets) return [200, BUDGETS];
    const post = request.method === "POST" ? POSTS[path] : undefined;
    if (post === undefined) return [404, REFUSED];
    const given = post(await read(request));
    return given === undefined ? [400, REFUSED] : [200, given];
  };
  const server: Server = createServer((request, response) => {
    const send = ([status, body]: [number, unknown]) => {
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    };
    answer(request).then(send, () => {
      send([500, REFUSED]);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  if (bound === null || typeof bound === "string") throw new Error("jarvisStandin: no port");
  const url = `http://127.0.0.1:${String(bound.port)}`;
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
