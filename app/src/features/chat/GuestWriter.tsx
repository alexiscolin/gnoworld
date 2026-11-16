// A guest's composer: one plain line in the composer's box, Enter sending it as the account's does, said through the server, which judges it before the bot says it
// as anon/<name>. The name is the visit's, asked as the reader first comes to the box; a refusal says why, in the field's own words.
// Connect Adena stays beside it: an account keeps its name and does what a guest cannot.
import { PHONE_QUERY } from "@gnoworld/core";
import type { GuestCause } from "@gnoworld/schemas";
import { Button, Cluster, Field, Stack } from "@gnoworld/ui";
import { useId, useRef, useState, type SubmitEvent } from "react";
import { pageGuestApi, type Refused } from "../../lib/api/guest.ts";
import { askFor } from "../../pageAsks.ts";
import { useComputerNeeded } from "./LogInToWrite.tsx";
import { MessageBox } from "./MessageBox.tsx";
import { useMedia } from "./useMedia.ts";
import { roomLabel } from "./names.ts";
import styles from "./LogInToWrite.module.css";

const api = pageGuestApi();

// What each cause says to the guest.
const CAUSES: Record<GuestCause, string> = {
  empty: "Write something first.",
  control: "This line holds characters a guest cannot send.",
  multiline: "A guest sends one line at a time.",
  too_long: "A guest's line is 280 characters at most.",
  banned_word: "Not sent: a word this room does not allow.",
  links: "A guest cannot send links. Connect Adena to share one.",
  mentions: "A guest names one person a line.",
  moderation: "Not sent: the moderation check held it.",
  muted: "You are muted here for a few minutes.",
  unchecked: "Guests cannot speak while the moderation check is down. Try again soon.",
  relay: "Not sent. Try again.",
  unsure: "It may have gone: look in the room before you send it again.",
};

// What a refusal with no cause says, by its reason.
function reasonOf(reason: Refused["reason"]): string {
  if (reason === "too_many") return "Slow down: a guest says a few lines a minute.";
  if (reason === "forbidden" || reason === "not_found") return "Guests cannot speak in this room.";
  if (reason === "unauthenticated") return "Your guest name has ended. Send again for a new one.";
  return "Not sent: the server did not answer.";
}

const problemOf = (said: Refused): string => (said.cause === undefined ? reasonOf(said.reason) : CAUSES[said.cause]);

// What an account has that a guest has not, said beside Connect Adena.
const ADENA_GIVES = "With Adena, a gno.land name of your own, links, replies and reactions.";
const PHONE_GUEST = "Guest · Connect for a name, links and reactions";

// No guest name to be had: the server answers 404 where guests do not speak at all (GUEST_CHAT=off, or no moderation to judge them).
const OFF = "Guests cannot speak on this server. Connect Adena to speak.";

// The visit's name, asked once as the reader first comes to the box, and again after the server ended it; a second ask while one is out
// waits for that one, so a quick Enter after the focus never makes a second name.
function useGuestName() {
  const [name, setName] = useState<string>();
  const [off, setOff] = useState(false);
  const askingRef = useRef<Promise<string | Refused> | undefined>(undefined);
  const ask = (): Promise<string | Refused> => {
    if (name !== undefined) return Promise.resolve(name);
    const out = askingRef.current;
    if (out !== undefined) return out;
    const asked = api.name().then((got) => {
      askingRef.current = undefined;
      if (!got.ok) {
        if (got.reason === "not_found") setOff(true);
        return got;
      }
      setName(got.value.name);
      return got.value.name;
    });
    askingRef.current = asked;
    return asked;
  };
  return {
    name,
    off,
    ask,
    forget: () => {
      setName(undefined);
    },
  };
}

// The box's own field: the design system's box of lines, fixed (no grip), which the composer's box draws with no edge of its own. A
// guest's line is one plain line: Enter sends it. `problem`: the id of the line saying why the last one did not go.
function GuestField(props: {
  label: string;
  draft: string;
  problem: string | undefined;
  onDraft: (draft: string) => void;
}) {
  const { label, draft, problem, onDraft } = props;
  // A phone's box has no line saying who speaks: its placeholder does.
  const asGuest = useMedia(PHONE_QUERY);
  return (
    <Field
      kind="lines"
      resizable={false}
      hideLabel
      label={`Message ${label}`}
      placeholder={`Message ${label}${asGuest ? " as a guest" : ""}`}
      value={draft}
      invalid={problem !== undefined}
      describedBy={problem}
      onChange={onDraft}
    />
  );
}

export function GuestWriter({ room }: { room: string }) {
  const label = roomLabel(room);
  const computer = useComputerNeeded();
  const guest = useGuestName();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();
  const problemId = useId();
  const send = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || sending) return;
    setSending(true);
    setProblem(undefined);
    const named = await guest.ask();
    if (typeof named !== "string") {
      setSending(false);
      setProblem(named.reason === "not_found" ? OFF : problemOf(named));
      return;
    }
    const said = await api.say({ room, text });
    setSending(false);
    if (said.ok) {
      setDraft("");
      return;
    }
    if (said.reason === "unauthenticated") guest.forget();
    setProblem(problemOf(said));
  };
  return (
    <form
      aria-label={`Write in ${label} as a guest`}
      data-guest=""
      onSubmit={(event) => {
        send(event).catch(reportError);
      }}
      onFocus={() => {
        if (guest.name === undefined) guest.ask().catch(reportError);
      }}
    >
      <Stack space="2xs">
        <MessageBox send="Send" goes={draft.trim() !== "" && !sending}>
          <GuestField
            label={label}
            draft={draft}
            problem={problem === undefined ? undefined : problemId}
            onDraft={(value) => {
              setDraft(value);
              setProblem(undefined);
            }}
          />
        </MessageBox>
        {problem === undefined ? null : (
          <p id={problemId} className={styles["problem"]} role="alert">
            {problem}
          </p>
        )}
        <GuestLine off={guest.off} name={guest.name} computer={computer} />
      </Stack>
    </form>
  );
}

/** The line under a guest's box: who speaks and what Adena gives, with Connect Adena. A phone without Adena draws none: its placeholder
 * says it speaks as a guest, the menu how to log in. */
function GuestLine({ off, name, computer }: { off: boolean; name: string | undefined; computer: boolean }) {
  // A phone's line is one short line, the way in a small control at its end (Alexis: "plus petit… sur une ligne").
  const phone = useMedia(PHONE_QUERY);
  if (computer && !off) return null;
  const said = name === undefined ? "You speak as a guest." : `You speak as ${name}.`;
  return (
    <Cluster justify="between" wrap={phone ? "no" : "yes"} className={styles["way"]}>
      <span className={phone ? "meta truncate" : "meta"}>
        {off ? "Guests cannot speak here." : phone ? PHONE_GUEST : `${said} ${ADENA_GIVES}`}
      </span>
      {computer ? null : (
        <Button
          size="s"
          icon="key"
          onClick={() => {
            askFor("log-in");
          }}
        >
          Connect Adena
        </Button>
      )}
    </Cluster>
  );
}
