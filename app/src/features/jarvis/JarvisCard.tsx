// Jarvis's cards in the chat column (10u-a): its introduction with the fixed asks and a field for a question of one's own (500 code points,
// Enter sends), then each ask as a card below: the answer, or one plain line for a guard, with the forms that need no model where Jarvis
// cannot answer (spent, off, an error). They are the asker's alone and the room never hears them (D1017).
import type { ReadOptions } from "@gnoworld/chain/read";
import type { JarvisAnswer, JarvisQuestion } from "@gnoworld/schemas";
import { Button, Card, Cluster, Field, Stack } from "@gnoworld/ui";
import { useState, type SyntheticEvent } from "react";
import type { JarvisItem } from "../../jarvisHere.ts";
import { pointsOf, QUESTION_CHARS } from "../../lib/api/jarvis.ts";
import { AnswerCard, type DrawMarkdown } from "./AnswerCard.tsx";
import type { CallPlace } from "../realms/index.ts";

// What each guard says, in one plain line (D13985); `spent`, `off` and a failure also give the forms below.
const LINES = {
  declined: "Jarvis only answers about gno.land, gnoworld and this place.",
  paused: "Jarvis is paused for you until tomorrow.",
  capped: "You have used your share of Jarvis for today.",
  early: "Jarvis is for accounts that have spoken here for a while.",
  busy: "Jarvis is busy in this room: try again later.",
  spent: "Jarvis has no budget left today.",
  off: "Jarvis is switched off.",
} as const;
const FAILED = "Jarvis could not answer: try again later.";
const FORMS = new Set<string>(["spent", "off"]);

interface JarvisForms {
  /** The palette, to search a place. */
  search: () => void;
  /** The realm's functions, when the place has a realm. */
  functions?: (() => void) | undefined;
}

/** What a card needs of the page: where it is, how to ask, and how to draw an answer. */
export interface JarvisCardContext {
  ask: (question: JarvisQuestion) => void;
  chain: CallPlace["chain"];
  options?: ReadOptions | undefined;
  gnoweb: string | undefined;
  own: string;
  draw: DrawMarkdown;
  onFly: (place: string) => void;
  forms: JarvisForms;
  room: string;
}

function Forms({ forms }: { forms: JarvisForms }) {
  return (
    <Cluster space="xs">
      <Button onClick={forms.search}>Search a place</Button>
      {forms.functions === undefined ? null : <Button onClick={forms.functions}>See the realm&apos;s functions</Button>}
    </Cluster>
  );
}

// The field for a question of one's own: its count out of 500; Enter sends, not the one that ends an input method's composition (ui's Field).
function Question({ send }: { send: (words: string) => void }) {
  const [text, setText] = useState("");
  const words = text.trim();
  const count = pointsOf(text);
  const over = count > QUESTION_CHARS;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (words === "" || over) return;
    send(words);
  };
  return (
    <form onSubmit={submit}>
      <Field
        kind="lines"
        label="Ask Jarvis"
        hideLabel
        placeholder="Ask Jarvis"
        value={text}
        onChange={setText}
        help={`${String(count)} / ${String(QUESTION_CHARS)}`}
        {...(over ? { error: "Too long for Jarvis." } : {})}
      />
    </form>
  );
}

function Intro({ ctx }: { ctx: JarvisCardContext }) {
  const { ask, room } = ctx;
  return (
    <Card tone="signal" compact>
      <Card.Header icon="spark" kicker="AI concierge" title="Jarvis" hint="AI · may be wrong" />
      <p>Jarvis answers about gno.land, gnoworld and the place you are in. Its answers are yours alone.</p>
      <Stack space="xs">
        <Cluster space="xs">
          <Button
            onClick={() => {
              ask({ ask: "here", room });
            }}
          >
            What can I do here?
          </Button>
          <Button
            onClick={() => {
              ask({ ask: "catch-up", room });
            }}
          >
            Catch up
          </Button>
        </Cluster>
        <Question
          send={(words) => {
            ask({ question: words, room });
          }}
        />
      </Stack>
    </Card>
  );
}

function Said({ value, forms }: { value: JarvisAnswer | undefined; forms: JarvisForms }) {
  return (
    <Card tone="signal" compact>
      <p data-jarvis-line="">{value === undefined ? FAILED : value.status === "answered" ? "" : LINES[value.status]}</p>
      {value === undefined || FORMS.has(value.status) ? <Forms forms={forms} /> : null}
    </Card>
  );
}

/** One card of the room's list. */
export function JarvisCard({ item, ctx }: { item: JarvisItem; ctx: JarvisCardContext }) {
  const { result } = item;
  if (item.ask === undefined) return <Intro ctx={ctx} />;
  if (result === undefined)
    return (
      <Card tone="signal" compact>
        <p role="status">Jarvis is reading…</p>
      </Card>
    );
  // The door's quota full (429) is the day's questions all asked: the share's line, not a failure to try again.
  const value = result.ok ? result.value : result.reason === "full" ? ({ status: "capped" } as const) : undefined;
  if (value?.status === "answered") return <AnswerCard {...ctx} answer={value} />;
  return <Said value={value} forms={ctx.forms} />;
}
