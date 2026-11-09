/// <reference types="vite/client" />
// "New version available" (ADR-0001 §12): the worker's update waits for this click.
import { Flash } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { useAfterLoad } from "../../later.ts";
import { hostAnswers, startServiceWorker } from "../../sw/register.ts";

export const PRODUCTION = import.meta.env.PROD;

// A Flash keeps its status region on the page from the start, empty: a screen reader announces a
// region's change, and may say nothing of one that arrives already filled. Closed, the update waits.
export function UpdateNotice({
  onReload,
  onClose,
}: {
  readonly onReload: (() => void) | null;
  readonly onClose: () => void;
}) {
  return (
    <Flash
      message={
        onReload === null ? null : { title: "New version available.", action: { label: "Reload", onAction: onReload } }
      }
      onClose={onClose}
    />
  );
}

export function UpdatePrompt() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  // The worker fetches its whole list: it registers once the page has loaded and rested, never while the first screen loads.
  const loaded = useAfterLoad();
  useEffect(() => {
    if (!loaded) return undefined;
    const leaving = new AbortController();
    startServiceWorker({
      container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      document,
      search: location.search,
      production: PRODUCTION,
      reachable: hostAnswers,
      signal: leaving.signal,
      reload: () => {
        location.reload();
      },
      report: (error) => {
        reportError(error);
      },
      onUpdate: (next) => {
        setApply(() => next);
      },
    }).catch(reportError);
    return () => {
      leaving.abort();
    };
  }, [loaded]);
  return (
    <UpdateNotice
      onReload={apply}
      onClose={() => {
        setApply(null);
      }}
    />
  );
}
