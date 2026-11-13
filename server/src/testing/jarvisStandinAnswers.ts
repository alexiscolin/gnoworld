// The stand-in's prepared texts: answers chosen by the question's words, the demo's scripted lines translated, a fixed digest. Nothing
// here is a live figure: an answer that needs one proposes the call or points to the plate that shows it.
import { z } from "zod";
import { JARVIS_LANGUAGES } from "@gnoworld/schemas";
import type { AnswerButton, JarvisAsk, JarvisMadeDigest, JarvisTranslate, JarvisTranslation } from "@gnoworld/schemas";
import crowdLanguages from "./crowdLanguages.json" with { type: "json" };

interface Prepared {
  markdown: string;
  buttons?: AnswerButton[];
}

const voteYes: AnswerButton = {
  type: "action",
  label: "Vote YES",
  action: {
    realm: "gno.land/r/gov/dao",
    function: "MustVoteOnProposalSimple",
    args: { pid: "", option: "YES" },
    why: "Casts your vote on the proposal whose number you type in the call card.",
  },
};

// The first rule whose words match the question answers it; the last has none and is the fallback.
const ANSWERS: { when: RegExp; say: Prepared }[] = [
  {
    when: /govdao|\bvot(e|ing)\b|proposal/i,
    say: {
      markdown:
        "**GovDAO** is the DAO that governs gno.land: its members vote on proposals, and an accepted proposal is executed by the realm.\n\n" +
        "To vote, open the proposal on the GovDAO plate and note its number. Then press **Vote YES** below: the call card opens with the vote prefilled, " +
        "you type the proposal's number, read what it will do, and sign it in your wallet. You can change YES to NO or ABSTAIN there. Only members' votes count.",
      buttons: [voteYes, { type: "fly", label: "Go to GovDAO", place: "/w/govdao" }],
    },
  },
  {
    when: /\b(send|transfer|pay)\b|gnot/i,
    say: {
      markdown:
        "GNOT is gno.land's native coin, and sending it is a **transfer from your wallet**, not a call to a realm.\n\n" +
        "Open your wallet (Adena), choose Send, the recipient's address or name and the amount, then read the fee and sign. " +
        "Nothing is sent from here, and I never sign for you. Your balance is on your account's plate, which reads it from the chain.",
    },
  },
  {
    when: /deploy|publish|addpkg|write a realm|my own realm/i,
    say: {
      markdown:
        "A realm is **deployed by publishing its source**: you write it in Gno, a language close to Go, and send it to the chain in a transaction under a path of yours, `gno.land/r/<you>/<name>`.\n\n" +
        "Try it on a testnet first: it costs nothing real, and the realm is callable once the chain reports it live. Its code is then public, and anyone can read it on gnoweb.",
    },
  },
  {
    when: /how.*(call|use)|call card|function|gnomcp/i,
    say: {
      markdown:
        "A realm exposes **functions** that anyone can call. Pick one on the realm's plate: the **call card** lists its parameters, " +
        "the fee and what it will do, and you sign it in your wallet.\n\n" +
        "gnomcp does the same for an AI assistant: it reads and calls realms through the same tools, and writes only with a session you approve.",
    },
  },
  {
    when: /\brealms?\b/i,
    say: {
      markdown:
        "A **realm** is a smart contract on gno.land: a package with its own state that stays between calls, written in Gno and published as source, so anyone can read it.\n\n" +
        "Each realm has a path like `gno.land/r/gov/dao` and usually a `Render` function that draws its page on gnoweb. " +
        "On a world's plate, **Its page** shows that page and **Functions** lists what you can call.",
    },
  },
  {
    when: /who.*(here|around|online)|people/i,
    say: {
      markdown:
        "The **People** list of this room shows who is here now, with their names and countries when they chose to show them. " +
        "I only read what is said in the room, not who is connected.",
    },
  },
  {
    when: /gnoworld|this (app|site|place)|where am i|how does it work/i,
    say: {
      markdown:
        "**gnoworld** is a social hub for gno.land. The Earth is the home; each realm or community is a **world** with its own plate, its room and its people.\n\n" +
        "Chat is for talking; everything on-chain (a vote, a transfer, a call) goes through a call card that you read and sign yourself. I can explain, point to a place and propose a call, never act for you.",
      buttons: [{ type: "fly", label: "Back to Earth", place: "/earth" }],
    },
  },
  {
    when: /gno\.land|\bgno\b|blockchain|testnet|onyx/i,
    say: {
      markdown:
        "**gno.land** is a blockchain where smart contracts are written in **Gno**, a language close to Go, and their source code is public on chain. " +
        "A contract is a **realm** (`/r/`) or a pure package (`/p/`).\n\nThere is a mainnet and testnets such as onyx, where you can try things without real funds.",
    },
  },
];
const FALLBACK: Prepared = {
  markdown:
    "I can only answer the demo's prepared questions here. Try: what is a realm, how do I vote on GovDAO, how do I send GNOT, how do I deploy a realm, what is gnoworld, or summarize this room.",
};

// A room's recent lines (oldest first): what was said, from the lines the server sent, never more.
function caughtUp(lines: { speaker: number; text: string }[]): Prepared {
  if (lines.length === 0) return { markdown: "Nothing was said here yet." };
  const people = new Set(lines.map(({ speaker }) => speaker)).size;
  const last = lines.slice(-3).map(({ text }) => `- ${Array.from(text).slice(0, 120).join("")}`);
  return {
    markdown: `**${String(lines.length)} lines from ${String(people)} ${people === 1 ? "person" : "people"}** in the latest stretch. The last of them:\n\n${last.join("\n")}`,
  };
}

export function answerOf(ask: JarvisAsk): Prepared {
  if ("ask" in ask) {
    if (ask.ask === "catch-up") return caughtUp(ask.lines);
    if (ask.ask === "here")
      return {
        markdown:
          "From here you can talk in the room, open the realm's plate to read its page and its functions, and call one of them through a call card. Ask me what a realm is, or how to vote on GovDAO.",
        buttons: [{ type: "fly", label: "Back to Earth", place: "/earth" }],
      };
    return {
      markdown: `\`${ask.function}\` is a function of \`${ask.realm}\`. Open the realm's plate and pick it under **Functions**: its call card lists the parameters it takes and what it will do, before you sign.`,
    };
  }
  if (/summari[sz]e|catch.?me.?up|what.*(said|missed)/i.test(ask.question)) return caughtUp(ask.lines);
  return ANSWERS.find(({ when }) => when.test(ask.question))?.say ?? FALLBACK;
}

// The demo's scripted lines (app/tests/e2e/crowd-script.txt) translated: each room's speaker's language (crowdLanguages.json) into
// English and, where that language is French or Spanish, the English line into it, with four more English ones into French and Spanish;
// any other line, or language, is kept as it is.
const TRANSLATIONS: Record<string, Partial<Record<"fr" | "es", string>>> = {
  "welcome to everyone who just landed here": {
    fr: "bienvenue à tous ceux qui viennent d'arriver",
    es: "bienvenidos a todos los que acaban de llegar",
  },
  "gm, anyone reading the new GovDAO proposal?": {
    fr: "gm, quelqu'un lit la nouvelle proposition de GovDAO ?",
    es: "gm, ¿alguien está leyendo la nueva propuesta de GovDAO?",
  },
  "remember these are testnet tokens, no real value": {
    fr: "rappel : ce sont des jetons de testnet, sans valeur réelle",
    es: "recuerden que son tokens de testnet, sin valor real",
  },
  "gnogolf v2 is live, who is playing today?": {
    fr: "gnogolf v2 est en ligne, qui joue aujourd'hui ?",
    es: "gnogolf v2 ya está disponible, ¿quién juega hoy?",
  },
};
const SIM = " (sim)";
const ME = "/me ";
const MENTION = /@g1[0-9a-z]{30,}/;

interface Pair {
  english: string;
  said: string;
  spoken: string;
}

// The English of a line in a room's language (an action may come without its mark), or the line in French or Spanish.
function lookup(pairs: Pair[], line: string, language: string): string | undefined {
  if (language === "en") {
    const pair = pairs.find(({ said }) => said === line || said === ME + line);
    return pair && (pair.said === line ? pair.english : pair.english.slice(ME.length));
  }
  if (language !== "fr" && language !== "es") return undefined;
  return (
    TRANSLATIONS[line]?.[language] ?? pairs.find(({ english, spoken }) => english === line && spoken === language)?.said
  );
}

export function translated({ text, language }: JarvisTranslate): JarvisTranslation {
  const rooms = z
    .record(
      z.string(),
      z.object({ language: z.string(), country: z.string(), lines: z.record(z.string(), z.string()) }),
    )
    .parse(crowdLanguages);
  const sim = text.endsWith(SIM);
  const mention = MENTION.exec(text)?.[0];
  const line = (sim ? text.slice(0, -SIM.length) : text).replace(MENTION, "@{prev}");
  const pairs = Object.values(rooms).flatMap(({ language: spoken, lines }) =>
    Object.entries(lines).map(([english, said]) => ({ english, said, spoken })),
  );
  const found = lookup(pairs, line, language);
  if (found === undefined) return { status: "original" };
  const out = mention === undefined ? found : found.replace("@{prev}", mention);
  const spoken = pairs.find(({ said }) => said === line || said === ME + line)?.spoken;
  const from = language === "en" ? JARVIS_LANGUAGES.find((code) => code === spoken) : "en";
  return { status: "translated", text: sim ? out + SIM : out, ...(from === undefined ? {} : { from }) };
}

// No digest: the stand-in reads no chain, and a digest names the block it was made at, which it would invent.
export const DIGEST: JarvisMadeDigest = { status: "none", made: false };
