// A line's translation: asked while its row is on screen (translating.ts), and drawn under its own words, which stay as they are, over
// one muted label; the line's More menu folds it away.
import { markdown, type Line } from "@gnoworld/core";
import { useEffect, useRef } from "react";
import type { JarvisHere } from "../../jarvisHere.ts";
import { languageName, type Language } from "../../lib/language.ts";
import { wantTranslation } from "../../translating.ts";
import { LineText } from "./LineText.tsx";
import { useLineTranslation } from "./translationItem.ts";
import styles from "./RoomView.module.css";

// Asks for the line's translation while the row that holds this span is on screen, and stops asking once it leaves.
function WatchLine({ room, id, language }: { room: string; id: string; language: Language }) {
  const markRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = markRef.current?.parentElement;
    if (row == null || typeof IntersectionObserver === "undefined") return undefined;
    let leave: (() => void) | undefined;
    const seen = new IntersectionObserver((entries) => {
      if (entries.at(-1)?.isIntersecting === true) leave = leave ?? wantTranslation({ room, id, language });
      else {
        leave?.();
        leave = undefined;
      }
    });
    seen.observe(row);
    return () => {
      seen.disconnect();
      leave?.();
    };
  }, [room, id, language]);
  return <span ref={markRef} hidden />;
}

// The room this line's translation is asked in, none where it is not: a reader's logged in, with Jarvis on and the switch on, for another's message in this room.
function asksFor({
  here,
  room,
  mine,
  line,
}: {
  here: JarvisHere | undefined;
  room: string | undefined;
  mine: boolean;
  line: Line;
}) {
  const asked =
    room !== undefined &&
    here?.account !== undefined &&
    here.auto !== false &&
    here.room === room &&
    !mine &&
    line.kind === "message";
  return asked ? room : undefined;
}

interface Props {
  line: Line;
  room: string | undefined;
  /** The reader's own line is in their language already. */
  mine: boolean;
  me: string | undefined;
  /** The line's mentions that are members, as LineText takes them. */
  known: string;
  stop: boolean;
}

/** The translation under a line, in the line's own text style and ink, set apart from the original by a rule at its start. */
export function LineTranslation({ line, room, mine, me, known, stop }: Props) {
  const { here, language, translated } = useLineTranslation(room, line.id);
  const askedIn = asksFor({ here, room, mine, line });
  return (
    <>
      {translated?.state === "done" && !translated.hidden ? (
        <div data-translation="" className={styles["translation"]}>
          <span className={["meta", styles["translated"]].join(" ")}>
            {translated.from === undefined ? "Translated" : `Translated from ${languageName(translated.from, "en")}`}
          </span>
          <LineText blocks={markdown(translated.text)} me={me} known={known} stop={stop} />
        </div>
      ) : null}
      {askedIn === undefined ? null : <WatchLine room={askedIn} id={line.id} language={language} />}
    </>
  );
}
