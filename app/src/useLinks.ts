// The identity of the account logged in, read as it is first wanted and shared by every view (lib/links/held.ts); none until the server answered.
import { useEffect, useSyncExternalStore } from "react";
import type { LinkList } from "./lib/api/links.ts";
import { linksHeld, readLinks } from "./lib/links/held.ts";

export function useLinks(account: string | undefined): LinkList | undefined {
  const mine = useSyncExternalStore(linksHeld.subscribe, linksHeld.get, () => undefined);
  useEffect(() => {
    if (account !== undefined && linksHeld.asked() !== account && linksHeld.failed() !== account)
      readLinks(account).catch(reportError);
  }, [account]);
  return mine !== undefined && mine.account === account ? mine.list : undefined;
}

/** Whether the last read of `account`'s list failed: the section says so and offers to read again. */
export const useLinksFailed = (account: string): boolean =>
  useSyncExternalStore(
    linksHeld.subscribe,
    () => linksHeld.failed() === account,
    () => false,
  );
