// "Release a command-line key" (D13940): a key's holder frees it from a gnoworld account with no session, by the same block and paste as a link.
// It never says whether the key was linked. Reached from the device menu and from Settings, logged in or not.
import { Dialog, Stack } from "@gnoworld/ui";
import { ReleaseFlow } from "./CommandTab.tsx";

export function ReleaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      title="Release a command-line key"
      description="Free a key from any gnoworld account it was linked to. You do not need to be logged in."
      open={open}
      onClose={onClose}
    >
      <Stack space="s">
        <ReleaseFlow onCancel={onClose} />
      </Stack>
    </Dialog>
  );
}
