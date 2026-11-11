import { Button, Cluster, Dialog, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  description: string;
  open: boolean;
  /** What it asks and what it costs. */
  children: ReactNode;
  /** The outline button that backs out. */
  cancel: string;
  /** The danger button that goes on. */
  go: string;
  /** Says whether to go on; Esc and Cancel say no. */
  close: (go: boolean) => void;
}

// The dialog that asks before something that cannot come back: a Cancel and a danger button, `close` says which.
export function ConfirmDialog({ title, description, open, children, cancel, go, close }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      description={description}
      open={open}
      onClose={() => {
        close(false);
      }}
    >
      <Stack space="s">
        <p>{children}</p>
        <Cluster justify="end">
          <Button
            emphasis="outline"
            onClick={() => {
              close(false);
            }}
          >
            {cancel}
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              close(true);
            }}
          >
            {go}
          </Button>
        </Cluster>
      </Stack>
    </Dialog>
  );
}
