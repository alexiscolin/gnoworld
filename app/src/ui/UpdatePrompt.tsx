/// <reference types="vite/client" />
// "New version available" (ADR-0001 §12): the worker's update waits for this click.
import { useEffect, useState } from "react";
import { startServiceWorker } from "../sw/register.ts";

export const PRODUCTION = import.meta.env.PROD;

// The status region is on the page from the start, empty: a screen reader announces a region's
// change, and may say nothing of one that arrives already filled.
export function UpdateNotice({ onReload }: { readonly onReload: (() => void) | null }) {
  return (
    <div role="status">
      {onReload === null ? null : (
        <>
          New version available.{" "}
          <button type="button" onClick={onReload}>
            Reload
          </button>
        </>
      )}
    </div>
  );
}

export function UpdatePrompt() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    const leaving = new AbortController();
    startServiceWorker({
      container: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      document,
      search: location.search,
      production: PRODUCTION,
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
  }, []);
  return <UpdateNotice onReload={apply} />;
}
