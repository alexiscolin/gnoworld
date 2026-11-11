// After a login, an address that is linked to others says so once (owners' moderation, part 5): the identity's other addresses, shortened, and an
// Unlink of this one, which the login just made fresh enough to ask. Nothing is shown for an address with no link.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { useEffect } from "react";
import { pageLinksApi } from "../../lib/api/links.ts";
import { readLinks } from "../../lib/links/held.ts";
import { raisePill } from "../../topPill.tsx";

const joined = (words: readonly string[]) =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;

export function LinkedNotice({ address }: { address: Address }) {
  useEffect(() => {
    const stop = new AbortController();
    pageLinksApi()
      .list()
      .then((got) => {
        if (stop.signal.aborted || !got.ok || !got.value.linked) return;
        const others = got.value.members
          .filter((member) => member.address !== address)
          .map((m) => shortAddress(m.address));
        raisePill({
          title: "This account is linked.",
          line: `It is linked with ${joined(others)}: each moderates the worlds the others own.`,
          action: {
            label: "Unlink",
            onAction: () => {
              pageLinksApi()
                .unlink(address)
                .then((done) => {
                  if (done.ok) readLinks(address).catch(reportError);
                  raisePill({
                    title: done.ok ? "Unlinked." : "Could not unlink.",
                    ...(done.ok ? {} : { line: "Sign in again, then try from Settings." }),
                  });
                }, reportError);
            },
          },
        });
      }, reportError);
    return () => {
      stop.abort();
    };
  }, [address]);
  return null;
}
