/// <reference types="vite/client" />
// "New version available" (ADR-0001 §12): the worker's update waits for this click.
import { useEffect, useState } from "react";
import { startServiceWorker } from "../sw/register.ts";

export const PRODUCTION = import.meta.env.PROD;

export function UpdateNotice({ onReload }: { readonly onReload: () => void }) {
  return (
    <div role="status">
      New version available.{" "}
      <button type="button" onClick={onReload}>
        Reload
      </button>
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
  return apply === null ? null : <UpdateNotice onReload={apply} />;
}
