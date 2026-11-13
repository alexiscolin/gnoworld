import type { Line } from "@gnoworld/core";
import { ConfirmDialog } from "../../ConfirmDialog.tsx";
import { quoted, shortAddress } from "./names.ts";

// The dialog that asks before an owner's or a moderator's hide or mute: what it takes, who it reaches, and that a mute is the world's; `close` says whether to go on.
export function AskModerate({
  line,
  act,
  close,
}: {
  line: Line;
  act: "hide" | "mute" | undefined;
  close: (go: boolean) => void;
}) {
  const mute = act === "mute";
  return (
    <ConfirmDialog
      title={mute ? "Mute this account?" : "Hide message?"}
      description={mute ? shortAddress(line.account ?? "") : quoted(line.text)}
      open={act !== undefined}
      cancel="Cancel"
      go={mute ? "Mute account" : "Hide message"}
      close={close}
    >
      {mute
        ? "It cannot speak in any room of this world. The mute ends by itself after a few minutes; there is no unmute."
        : "It leaves the room for everyone, and cannot come back."}
    </ConfirmDialog>
  );
}
