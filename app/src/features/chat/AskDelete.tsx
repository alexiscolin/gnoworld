import type { Line } from "@gnoworld/core";
import { ConfirmDialog } from "../../ConfirmDialog.tsx";
import { quoted } from "./names.ts";

// The dialog that asks before a delete: which line, where, and that it cannot come back; `close` says whether to delete.
export function AskDelete({
  line,
  place,
  open,
  close,
}: {
  line: Line;
  place: string;
  open: boolean;
  close: (go: boolean) => void;
}) {
  return (
    <ConfirmDialog
      title="Delete message?"
      description={quoted(line.text)}
      open={open}
      cancel="Keep it"
      go="Delete message"
      close={close}
    >
      It leaves {place}, and cannot come back.
    </ConfirmDialog>
  );
}
