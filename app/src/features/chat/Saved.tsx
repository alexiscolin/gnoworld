// The saved messages' button and its list (slice 4's 4d): for an account alone, which has a device to keep them on, beside the rooms (the
// account menu opens the same list, slice 8). The list's code comes when it is first asked for.
import { Icon, NavItem } from "@gnoworld/ui";
import { useState } from "react";
import { useLocation } from "react-router";
import { SavedDialog } from "./SavedDialog.tsx";

export function Saved() {
  // Open at an address: a move to another (its link, "Open in room") closes it, as the room behind it changes.
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const [asked, setAsked] = useState(false);
  return (
    <>
      <NavItem
        lead={<Icon name="bookmark" />}
        onClick={() => {
          setAsked(true);
          setOpened(key);
        }}
      >
        Saved
      </NavItem>
      {asked ? (
        <SavedDialog
          open={opened === key}
          onClose={() => {
            setOpened(undefined);
          }}
        />
      ) : null}
    </>
  );
}
