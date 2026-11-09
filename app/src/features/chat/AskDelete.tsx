import type { Line } from "@gnoworld/core";
import { Button, Cluster, Dialog, Stack } from "@gnoworld/ui";
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
    <Dialog
      title="Delete message?"
      description={quoted(line.text)}
      open={open}
      onClose={() => {
        close(false);
      }}
    >
      <Stack space="s">
        <p>It leaves {place}, and cannot come back.</p>
        <Cluster justify="end">
          <Button
            emphasis="outline"
            onClick={() => {
              close(false);
            }}
          >
            Keep it
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              close(true);
            }}
          >
            Delete message
          </Button>
        </Cluster>
      </Stack>
    </Dialog>
  );
}
