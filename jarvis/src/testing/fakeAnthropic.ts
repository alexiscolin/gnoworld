// A fake Anthropic API for the entry's tests: a real HTTP server on the loopback that jarvis's own SDK client reaches
// through testing/outbound.ts, answering each POST /v1/messages with the script's next step: an answer built from the
// SDK's types (fakeModel.ts), an error status, or a request it holds open until the test releases it or the client
// leaves. It keeps each request's key and body, and says when they came.
import type { IncomingMessage, ServerResponse } from "node:http";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { bodyOf, onLoopback } from "./loopback.ts";

/** A step: an answer, an error the API sends, or a request held open until `release` is called with its answer. */
interface Held {
  held: true;
  release: Promise<Anthropic.Message>;
}
export type FakeStep = Anthropic.Message | { status: number; error: string } | Held;

interface Seen {
  readonly key: string | undefined;
  readonly body: { readonly tools?: readonly { name: string }[] | undefined; readonly [key: string]: unknown };
}
const Body = z.looseObject({ tools: z.array(z.looseObject({ name: z.string() })).optional() });

/** A step held open: the request waits until `answer` is called, or until its client leaves. */
export const held = () => {
  const { promise, resolve } = Promise.withResolvers<Anthropic.Message>();
  return { step: { held: true, release: promise } satisfies Held, answer: resolve };
};

export async function fakeAnthropic(steps: FakeStep[]) {
  const seen: Seen[] = [];
  const arrived: (() => void)[] = [];
  const write = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const body = Body.parse(JSON.parse(await bodyOf(request)));
    // SDK 1.4.0 sends the key as a bearer token (client.js, apiKeyAuth).
    seen.push({ key: /^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1], body });
    for (const waiting of arrived.splice(0)) waiting();
    const step = steps.shift();
    if (step === undefined)
      write(response, 500, { type: "error", error: { type: "api_error", message: "unscripted" } });
    else if ("held" in step) write(response, 200, await step.release);
    else if ("status" in step)
      write(response, step.status, { type: "error", error: { type: step.error, message: "made-up" } });
    else write(response, 200, step);
  };
  const { origin, close } = await onLoopback(handle);
  return {
    origin,
    seen,
    /** Once the model has been asked `count` requests in all. */
    asked: async (count: number) => {
      while (seen.length < count) await new Promise<void>((resolve) => arrived.push(resolve));
    },
    close,
  };
}
