// The saved messages' button and its list (slice 4's 4d): for an account alone, which has a device to keep them on,
// beside the rooms until slice 8's account menu takes it. The list's code comes when it is first asked for.
import { Button } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router";
import { useApp, useAppStore } from "../../storeContext.tsx";

const SavedView = lazy(async () => ({ default: (await import("./SavedView.tsx")).SavedView }));

export function Saved() {
  const store = useAppStore();
  const saved = useApp(({ keep }) => keep.saved);
  const notKept = useApp(({ keep }) => keep.notKept);
  // Open at an address: a move to another (its link, "Open in room") closes it, as the room behind it changes.
  const { key } = useLocation();
  const [opened, setOpened] = useState<string>();
  const [asked, setAsked] = useState(false);
  const open = opened === key;
  return (
    <>
      <Button
        icon="bookmark"
        emphasis="quiet"
        onClick={() => {
          setAsked(true);
          setOpened(key);
        }}
      >
        Saved
      </Button>
      {asked ? (
        <Suspense fallback={null}>
          <SavedView
            saved={saved}
            open={open}
            notKept={notKept}
            onClose={() => {
              setOpened(undefined);
            }}
            onRemove={(room, id) => {
              store.getState().keepActions.unsave(room, id);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
