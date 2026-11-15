// The saved messages' list as a dialog with its data: what the rooms' Saved and the account menu both open. Its
// code comes when it is first asked for.
import { lazy, Suspense } from "react";
import { useApp, useAppStore } from "../../storeContext.tsx";

const SavedView = lazy(async () => ({ default: (await import("./SavedView.tsx")).SavedView }));

export function SavedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useAppStore();
  const saved = useApp(({ keep }) => keep.saved);
  const notKept = useApp(({ keep }) => keep.notKept);
  return (
    <Suspense fallback={null}>
      <SavedView
        saved={saved}
        open={open}
        notKept={notKept}
        onClose={onClose}
        onRemove={(room, id) => {
          store.getState().keepActions.unsave(room, id);
        }}
      />
    </Suspense>
  );
}
