// Poll's dialog: the question and its answers in fields, sent as the line `/poll` would make (core's pollText, composed as a typed
// draft is), so nobody has to know the syntax. A line over the IRC limit is said in its own field, as the composer says its own.
import { POLL_KEYS, pollText, type Composed } from "@gnoworld/core";
import { Button, Dialog, Field, Cluster, IconButton, Sidebar, Stack } from "@gnoworld/ui";
import { useRef, useState, type SubmitEvent } from "react";
import { composeDraft } from "./polling.ts";

/** Sends a composed line, as the composer's Send does; whether it went. */
type Say = (composed: Composed, draft: string) => boolean;

interface Answer {
  id: number;
  text: string;
}

const tidy = (text: string): string => text.replaceAll(/\s+/gu, " ").trim();
const START = 2;

/** What keeps the poll from going: a message per field (the question is the first line, each answer the next), and one for the whole. */
interface Problems {
  question?: string | undefined;
  answers: (string | undefined)[];
  form?: string | undefined;
}

// The composed poll's own refusals (a line over its bytes), then the empty fields once Ask was pressed.
function problemsOf(composed: Composed, fields: { question: string; answers: string[]; tried: boolean }): Problems {
  const { question, answers, tried } = fields;
  const empty = (text: string, say: string) => (tried && text === "" ? say : undefined);
  const found: Problems = {
    question: empty(question, "Write the question."),
    answers: answers.map((a) => empty(a, "Write this answer.")),
  };
  if (composed.kind === "long" && composed.line !== undefined) {
    const over = `Too long by ${String(composed.over)} bytes.`;
    if (composed.line === 1) found.question = over;
    else found.answers[composed.line - 2] = over;
  } else if (composed.kind === "long" || composed.kind === "tooBig" || composed.kind === "malformed") {
    found.form = "This poll is too long to send: shorten it.";
  }
  return found;
}

const clear = ({ question, answers, form }: Problems): boolean =>
  question === undefined && form === undefined && answers.every((answer) => answer === undefined);

interface FormProps {
  room: string;
  nick: string;
  say: Say;
  onClose: () => void;
}

interface RowProps {
  at: number;
  text: string;
  error: string | undefined;
  removable: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}

// One answer: its field and, at its end, its remove control; a blank of the control's width keeps the fields on one edge.
function AnswerRow({ at, text, error, removable, onChange, onRemove }: RowProps) {
  return (
    <Sidebar side="end" space="2xs">
      <Field
        label={`Answer ${String(at + 1)}`}
        value={text}
        onChange={onChange}
        {...(error === undefined ? {} : { error })}
      />
      {removable ? (
        <IconButton icon="close" label={`Remove answer ${String(at + 1)}`} emphasis="plain" onClick={onRemove} />
      ) : (
        <span aria-hidden="true" style={{ inlineSize: "var(--control-m)" }} />
      )}
    </Sidebar>
  );
}

function PollForm({ room, nick, say, onClose }: FormProps) {
  const [question, setQuestion] = useState("");
  const nextRef = useRef(START);
  const [answers, setAnswers] = useState<Answer[]>(() => Array.from({ length: START }, (_, id) => ({ id, text: "" })));
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState(false);
  const texts = answers.map((answer) => tidy(answer.text));
  const draft = pollText({ question: tidy(question), answers: texts });
  const composed = composeDraft(room, draft, nick);
  const problems = problemsOf(composed, { question: tidy(question), answers: texts, tried });
  const change = (id: number, text: string) => {
    setAnswers((was) => was.map((answer) => (answer.id === id ? { id, text } : answer)));
  };
  const send = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    if (!clear(problemsOf(composed, { question: tidy(question), answers: texts, tried: true }))) return;
    if (say(composed, draft)) onClose();
    else setRefused(true);
  };
  return (
    <form onSubmit={send} aria-label="Ask a poll">
      <Stack space="l">
        <Field
          label="Question"
          value={question}
          onChange={setQuestion}
          {...(problems.question === undefined ? {} : { error: problems.question })}
        />
        <Stack space="m">
          {answers.map((answer, at) => (
            <AnswerRow
              key={answer.id}
              at={at}
              text={answer.text}
              error={problems.answers[at]}
              removable={answers.length > START}
              onChange={(text) => {
                change(answer.id, text);
              }}
              onRemove={() => {
                setAnswers((was) => was.filter((each) => each.id !== answer.id));
              }}
            />
          ))}
          {answers.length < POLL_KEYS.length ? (
            <Cluster>
              <Button
                emphasis="quiet"
                size="s"
                icon="plus"
                onClick={() => {
                  setAnswers((was) => [...was, { id: nextRef.current++, text: "" }]);
                }}
              >
                Add an answer
              </Button>
            </Cluster>
          ) : null}
        </Stack>
        {problems.form === undefined && !refused ? null : (
          <p role="alert">{problems.form ?? "Not sent: the chat refused this poll."}</p>
        )}
        <Cluster justify="end">
          <Button emphasis="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" emphasis="solid">
            Ask
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

export interface PollDialogProps extends Omit<FormProps, "onClose"> {
  open: boolean;
  onClose: () => void;
}

/** Poll's dialog over the dock; its fields start blank each time it opens. */
export function PollDialog({ open, onClose, ...rest }: PollDialogProps) {
  return (
    <Dialog
      title="Ask a poll"
      description={`A question and two to ${String(POLL_KEYS.length)} answers; each one votes with its number.`}
      open={open}
      onClose={onClose}
    >
      {open ? <PollForm {...rest} onClose={onClose} /> : null}
    </Dialog>
  );
}
