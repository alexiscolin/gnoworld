// The row of quick actions over the composer, a place's own as the video draws them: the Earth's (frame 56: Who's here, Quiz,
// Calendar, Poll), a world's with a realm (frame 31: Proposal, Events, Realm, Catch up), a world's without (frame 104: Play,
// Catch up, Poll), a direct message's (frame 80: Who's here, Quiz). Who's here stands first in a world's too, the dock having no
// other way to its people. What a later slice brings is greyed (ui's ComingSoon); Catch up, Jarvis's, only where the row is wide.
import { ComingSoon } from "@gnoworld/ui";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import styles from "./QuickActions.module.css";

const Calendar = lazy(async () => (await import("../events/index.ts")).calendar());

/** What a conversation is, for its pills: the Earth's general chat, a world's with a realm or without, a direct message. */
type PillsOf = "earth" | "realm" | "hub" | "dm";

export interface QuickActionsProps {
  onWhoIsHere: () => void;
  /** The world the chat is in, by its slug: its events come first in the calendar. */
  world: string;
  pills: PillsOf;
  /** The world's realm's view on the site, which Realm opens. */
  realm?: string | undefined;
  /** Whether the reader writes here: Poll starts a poll in the composer. */
  writes: boolean;
}

// One pill of the row: an edge, the words centred, the row's width shared among the pills.
function Action({ label, onClick }: { label: string; onClick: (target: HTMLElement) => void }) {
  return (
    <button
      type="button"
      className={styles["action"]}
      onClick={(event) => {
        onClick(event.currentTarget);
      }}
    >
      {label}
    </button>
  );
}

// A pill a later slice brings: in its place, greyed and inert.
function Soon({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <span className={styles["soon"]} data-wide={wide ? "" : undefined}>
      <ComingSoon name={label}>
        <span className={styles["action"]}>{label}</span>
      </ComingSoon>
    </span>
  );
}

/** Poll: `/poll ` before the draft of the composer under the row, the caret after it (core's compose reads the rest). */
function startPoll(from: HTMLElement): void {
  const field = from.closest(`.${styles["dock"] ?? ""}`)?.querySelector("textarea");
  if (field === null || field === undefined) return;
  field.focus();
  if (!field.value.startsWith("/poll ")) field.setRangeText("/poll ", 0, 0, "end");
  else field.setSelectionRange(field.value.length, field.value.length);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

// Realm: the world's realm's view on the site.
function RealmPill({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <Action
      label="Realm"
      onClick={() => {
        Promise.resolve(navigate(to)).catch(reportError);
      }}
    />
  );
}

function useCalendar(world: string) {
  // Asked once: the dialog stays in the page after, so the browser gives the focus back to the pill as it closes.
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return {
    open: () => {
      setAsked(true);
      setOpen(true);
    },
    dialog: asked ? (
      <Suspense fallback={null}>
        <Calendar
          world={world}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      </Suspense>
    ) : null,
  };
}

export function QuickActions({ onWhoIsHere, world, pills, realm, writes }: QuickActionsProps) {
  const calendar = useCalendar(world);
  const who = <Action key="who" label="Who's here" onClick={onWhoIsHere} />;
  const events = (label: string) => <Action key="events" label={label} onClick={calendar.open} />;
  const poll = writes ? <Action key="poll" label="Poll" onClick={startPoll} /> : null;
  const catchUp = <Soon key="catch" label="Catch up" wide />;
  const realmPill = realm === undefined ? null : <RealmPill key="realm" to={realm} />;
  const rows: Record<PillsOf, ReactNode[]> = {
    earth: [who, <Soon key="quiz" label="Quiz" />, events("Calendar"), poll],
    realm: [who, <Soon key="proposal" label="Proposal" />, events("Events"), realmPill, catchUp],
    hub: [who, <Soon key="play" label="Play" />, events("Events"), catchUp, poll],
    dm: [who, <Soon key="quiz" label="Quiz" />],
  };
  return (
    <div role="toolbar" aria-label="Quick actions" className={styles["bar"]}>
      {rows[pills]}
      {calendar.dialog}
    </div>
  );
}
