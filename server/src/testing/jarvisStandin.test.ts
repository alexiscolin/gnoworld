import { JARVIS_EXAMPLES } from "@gnoworld/schemas";
import { Secret } from "@gnoworld/service/settings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import languages from "./crowdLanguages.json" with { type: "json" };
import { jarvisClient } from "../door/jarvis.ts";
import { startStandin } from "./jarvisStandin.ts";

const KEY = "a-key-of-at-least-thirty-two-characters";
let stop: () => Promise<void>;
let client: ReturnType<typeof jarvisClient>;
const signal = () => new AbortController().signal;
const lines = [{ speaker: 1, text: "gm" }];

beforeAll(async () => {
  const started = await startStandin(KEY);
  stop = started.stop;
  client = jarvisClient({ url: started.url, timeoutMs: 5000, key: new Secret(KEY) });
});
afterAll(async () => {
  await stop();
});

describe("the jarvis stand-in, read by the server's own client", () => {
  it("answers each prepared question with an answer its schema reads", async () => {
    for (const question of [
      "what is a realm?",
      "how do I vote on GovDAO?",
      "how do I send GNOT?",
      "how do I deploy a realm?",
      "how do I call a function?",
      "who is here?",
      "what is gnoworld?",
      "what is gno.land?",
      "summarize this room",
      "write me a poem about toasters",
    ]) {
      const got = await client.ask({ question, room: "#bubble", lines }, signal());
      // The client parses every answer with JarvisPaidAnswer: ok means it did.
      expect(got.ok && got.answer.status, question).toBe("answered");
    }
  });

  it("answers each example the composer offers with a prepared answer, never the fallback", async () => {
    for (const question of JARVIS_EXAMPLES) {
      const got = await client.ask({ question, room: "#bubble", lines }, signal());
      expect(got.ok && got.answer.status === "answered" && got.answer.markdown, question).not.toMatch(
        /prepared questions/,
      );
    }
  });

  it("proposes the GovDAO vote with no proposal number and says the fallback for the rest", async () => {
    const vote = await client.ask({ question: "how do I vote on GovDAO?", room: "#govdao", lines: [] }, signal());
    expect(vote.ok && vote.answer.status === "answered" && vote.answer.buttons.map(({ type }) => type)).toEqual([
      "action",
      "fly",
    ]);
    const other = await client.ask({ question: "what is the meaning of life", room: "#govdao", lines: [] }, signal());
    expect(other.ok && other.answer.status === "answered" && other.answer.markdown).toMatch(/prepared questions/);
  });

  it("answers the fixed asks, a translation, a digest, an explanation and the budgets", async () => {
    expect((await client.ask({ ask: "here", room: "#bubble", lines: [] }, signal())).ok).toBe(true);
    expect((await client.ask({ ask: "catch-up", room: "#bubble", lines }, signal())).ok).toBe(true);
    const fn = {
      ask: "function",
      room: "#govdao",
      realm: "gno.land/r/gov/dao",
      function: "Render",
      lines: [],
    } as const;
    expect((await client.ask({ ...fn, lines: [] }, signal())).ok).toBe(true);
    expect(
      await client.translate({ text: "welcome to everyone who just landed here (sim)", language: "fr" }, signal()),
    ).toEqual({
      ok: true,
      answer: { status: "translated", text: "bienvenue à tous ceux qui viennent d'arriver (sim)", from: "en" },
    });
    expect(
      await client.translate(
        { text: "ich lese ihn gerade, ich will vor der Abstimmung wissen, was er ändert (sim)", language: "en" },
        signal(),
      ),
    ).toEqual({
      ok: true,
      answer: {
        status: "translated",
        text: "reading it now, I like to know what it changes before the vote (sim)",
        from: "de",
      },
    });
    expect(await client.translate({ text: "an unscripted line", language: "es" }, signal())).toEqual({
      ok: true,
      answer: { status: "original" },
    });
    expect((await client.digest({ universe: "onyx", realm: "gno.land/r/gov/dao" }, signal())).ok).toBe(true);
    expect((await client.explain({ chain: "onyx-1", realm: "gno.land/r/gov/dao" }, signal())).ok).toBe(true);
    expect((await client.budgets()).ok).toBe(true);
    expect((await client.setBudget({ budget: "ask", dollars: 7 })).ok).toBe(true);
  });

  it("translates each of the crowd's languages into the script's English, and the English back where the room speaks fr or es", async () => {
    for (const [room, { language, lines }] of Object.entries(languages))
      for (const [english, said] of Object.entries(lines)) {
        const back = await client.translate({ text: `${said} (sim)`, language: "en" }, signal());
        expect(back, `${room}: ${said}`).toEqual({
          ok: true,
          answer: { status: "translated", text: `${english} (sim)`, from: language },
        });
        if (language === "fr" || language === "es") {
          const forth = await client.translate({ text: english, language }, signal());
          expect(forth, `${room}: ${english}`).toEqual({
            ok: true,
            answer: { status: "translated", text: said, from: "en" },
          });
        }
      }
  });

  it("translates a line that mentions someone and an action without its mark, and leaves the rest", async () => {
    const address = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    expect(
      await client.translate(
        { text: `@${address} ah super, je n'avais pas encore trouvé la Carte (sim)`, language: "en" },
        signal(),
      ),
    ).toEqual({
      ok: true,
      answer: { status: "translated", text: `@${address} oh nice, I had not found the Map yet (sim)`, from: "fr" },
    });
    expect(await client.translate({ text: "fait signe depuis Lisbonne (sim)", language: "en" }, signal())).toEqual({
      ok: true,
      answer: { status: "translated", text: "waves from Lisbon (sim)", from: "fr" },
    });
    expect(await client.translate({ text: "bonjour", language: "de" }, signal())).toEqual({
      ok: true,
      answer: { status: "original" },
    });
    expect(
      await client.translate({ text: "welcome to everyone who just landed here", language: "es" }, signal()),
    ).toEqual({
      ok: true,
      answer: { status: "translated", text: "bienvenidos a todos los que acaban de llegar", from: "en" },
    });
  });

  it("refuses a request without the door's key", async () => {
    const keyless = jarvisClient({ url: (await startStandin(KEY)).url, timeoutMs: 5000 });
    expect(await keyless.budgets()).toEqual({ ok: false, error: "failed" });
  });
});
