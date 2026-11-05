// The warning before a link off the site (plan §3, ADR-0002 §4): a page we do not control may wear a trusted name. The link is a button, so
// no click, middle click or "open in a new tab" goes there unasked; pressing it opens a dialog that names the host the address really goes
// to and shows the whole address. Only the dialog's own link leaves. A realm's page, the calendar and the bell share it.
import { Button, Dialog, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { hostOf } from "@gnoworld/chain/read";

/** The way to ask before leaving: `ask` opens the warning for an address; `dialog` is the one warning, drawn once in the page. */
export function useLeaving() {
  // The address last asked, kept as the dialog closes so the browser can give the focus back to the button; the dialog is
  // not in the page until one was asked, so a page with no such link carries none.
  const [asked, setAsked] = useState<string>();
  const [open, setOpen] = useState(false);
  const host = asked === undefined ? "" : hostOf(asked);
  const close = () => {
    setOpen(false);
  };
  return {
    ask: (href: string) => {
      setAsked(href);
      setOpen(true);
    },
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
