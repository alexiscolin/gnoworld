// The credits dialog for a control that is not the corner's: `show` opens it, `dialog` is drawn beside the control, from the first show on.
import { useState, type ReactNode } from "react";
import { CreditsDialog } from "./CreditsDialog.tsx";

export function useCredits(): { show: () => void; dialog: ReactNode } {
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  return {
    show: () => {
      setAsked(true);
      setOpen(true);
    },
    dialog: asked ? (
      <CreditsDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    ) : null,
  };
}
