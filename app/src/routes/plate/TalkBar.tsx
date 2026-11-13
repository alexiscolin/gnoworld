// The talk bar (the proposal's .talk): who spoke in the place's room, the newest words and the way into the chat. A pill on the resting fill, the
// whole bar a link to the chat (the button's link stretches over it, ui's `stretch`), whose composer the focus follows (Actions.tsx). It says nothing it does not
// know: with no words, the invitation alone.
import type { CSSProperties } from "react";
import { Button, Cluster, nameColour, Stack } from "@gnoworld/ui";
import { roomLabel } from "../../features/chat/index.ts";
import { useApp } from "../../storeContext.tsx";
import styles from "./TalkBar.module.css";

const CLIP = 90;
const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP - 1)}…` : text);
// The faces beside the words: the last people who spoke, three at most.
const FACES = 3;

export function TalkBar({ name, room }: { name: string; room: string }) {
  const label = roomLabel(room);
  const lines = useApp(({ chat }) => chat.rooms[room]?.lines);
  const spoken = lines?.filter((line) => line.kind === "message") ?? [];
  const latest = spoken.at(-1);
  const faces = [...new Set(spoken.toReversed().map((line) => line.from))].slice(0, FACES).toReversed();
  return (
    <div className={["pill-ends", "pointer", styles["talk"]].join(" ")} role="group" aria-label={`Chat about ${name}`}>
      <Cluster justify="between" space="s" wrap="no">
        <Cluster space="s" wrap="no" className={styles["who"]}>
          {faces.length === 0 ? null : (
            <span className={styles["faces"]}>
              {faces.map((from, at) => (
                <span
                  key={from}
                  className={["disc", styles["face"]].join(" ")}
                  style={{ "--_bg": nameColour(from), "--n": at } as CSSProperties}
                  aria-hidden="true"
                >
                  {from.charAt(0).toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <Stack space="3xs" className={styles["said"]}>
            <b className={styles["title"]}>{`Ask about ${name} in ${label}`}</b>
            <span className={["truncate", styles["words"]].join(" ")}>
              {latest === undefined
                ? `Nobody has spoken in ${label} yet. Your question can be the first.`
                : `${latest.from}: ${clip(latest.text)}`}
            </span>
          </Stack>
        </Cluster>
        {/* The link's press covers the bar, a click anywhere on it the button's, which the bar's hover lights. */}
        <Button href="#chat" emphasis="outline" icon="chat" pad="wide" stretch>
          Open chat
        </Button>
      </Cluster>
    </div>
  );
}
