// The composer's box, which other parts of the page give the focus to: a member's editable box in the chat, or, as "Say hi" opens it, a
// guest's textarea too (GuestWriter's "Write in … as a guest").
/** The composer's field in a form: the editable box, which a textarea was. */
export const FIELD = '[role="textbox"]';
const MEMBER = `#chat ${FIELD}`;
const ANYONE = `${FIELD}, #chat textarea, form[aria-label^="Write in"] textarea`;
// How long the box is waited for: the full chat grows in, and a guest's box mounts after it.
const GIVE_UP_MS = 5000;

/** The composer's box standing now: a member's in the chat; with `guest`, a member's anywhere or a guest's. */
export const composerBox = (guest: boolean): HTMLElement | null =>
  document.querySelector<HTMLElement>(guest ? ANYONE : MEMBER);

/** Focuses the composer's box, a member's or a guest's, once the chat has drawn it: five seconds at most. */
export function focusComposer(): void {
  const now = composerBox(true);
  if (now !== null) {
    now.focus();
    return;
  }
  const watch = new MutationObserver(() => {
    const found = composerBox(true);
    if (found === null) return;
    watch.disconnect();
    found.focus();
  });
  watch.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
    watch.disconnect();
  }, GIVE_UP_MS);
}
