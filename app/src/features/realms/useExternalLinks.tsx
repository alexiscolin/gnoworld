// A link off gnoweb is behind a warning (plan §3, ADR-0002 §4): a page we do not control may call any address by a trusted
// one's name. Such a link is a button, so no click, middle click or "open in a new tab" goes there unasked; pressing it opens
// a dialog that names the host the address really goes to and shows the whole address. Only the dialog's own link leaves.
import { Button, Dialog, Stack } from "@gnoworld/ui";
import { useState, type ReactNode } from "react";
import styles from "./RealmBlocks.module.css";

/** Whether an address of a page is on gnoweb's own origin: the same scheme, host and port, never one that only starts alike. */
function isOwn(href: string, origin: string | undefined): boolean {
  if (origin === undefined) return false;
  try {
    return new URL(href).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

// The host an address goes to, as the browser reads it; the address itself when it has none.
function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

/** The way a page draws its links: `link` is the reader's own drawing, which leaves a link on gnoweb to the usual anchor and
 * gives any other a button; `dialog` is the one warning they share, to be drawn once in the page. */
export function useExternalLinks(origin: string | undefined) {
  // The address last asked, kept as the dialog closes so the browser can give the focus back to the button; the dialog is
  // not in the page until one was asked, so a page with no such link carries none.
  const [asked, setAsked] = useState<string>();
  const [open, setOpen] = useState(false);
  const host = asked === undefined ? "" : hostOf(asked);
  const close = () => {
    setOpen(false);
  };
  return {
    link: (href: string, label: ReactNode[]): ReactNode =>
      isOwn(href, origin) ? undefined : (
        <button
          type="button"
          className={styles["external"]}
          title={href}
          dir="ltr"
          onClick={() => {
            setAsked(href);
            setOpen(true);
          }}
        >
          {label}
        </button>
      ),
    dialog:
      asked === undefined ? undefined : (
        <Dialog
          key="warning"
          title="Leaving this page"
          description={`This link goes to ${host}, a site neither gnoworld nor gnoweb controls.`}
          open={open}
          onClose={close}
        >
          <Stack space="s">
            <p>
              The address, whole: <code dir="ltr">{asked}</code>
            </p>
            <Button href={asked} emphasis="solid">
              {`Go to ${host}`}
            </Button>
            <Button onClick={close}>Stay here</Button>
          </Stack>
        </Dialog>
      ),
  };
}
