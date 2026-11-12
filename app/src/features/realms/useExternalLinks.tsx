// A link off gnoweb is behind a warning (plan §3, ADR-0002 §4; leaving.tsx): such a link is a button that opens it.
import { Button } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useLeaving } from "../../leaving.tsx";

/** Whether an address of a page is on gnoweb's own origin: the same scheme, host and port, never one that only starts alike. */
function isOwn(href: string, origin: string | undefined): boolean {
  if (origin === undefined) return false;
  try {
    return new URL(href).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/** The way a page draws its links (`also`: a second origin that is ours, the app's own): `link` is the reader's own drawing, which leaves a link on gnoweb to the usual anchor and
 * gives any other a button; `dialog` is the one warning they share, to be drawn once in the page. */
export function useExternalLinks(origin: string | undefined, also?: string) {
  const { ask, dialog } = useLeaving();
  return {
    link: (href: string, label: ReactNode[]): ReactNode =>
      isOwn(href, origin) || (also !== undefined && isOwn(href, also)) ? undefined : (
        <Button
          emphasis="link"
          description={href}
          onClick={() => {
            ask(href);
          }}
        >
          <span dir="ltr">{label}</span>
        </Button>
      ),
    dialog,
  };
}
