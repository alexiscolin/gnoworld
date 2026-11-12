// The composer's box takes the focus once the chat has drawn it, as "Say hi" opens the chat: the box is asked for until it stands, for
// five seconds at most (the full chat grows in, and a guest's box mounts after it).
const FIELD = '[role="textbox"], #chat textarea, form[aria-label^="Write in"] textarea';
const GIVE_UP_MS = 5000;

export function focusComposer(): void {
  const field = () => document.querySelector<HTMLElement>(FIELD);
  const now = field();
  if (now !== null) {
    now.focus();
    return;
  }
  const watch = new MutationObserver(() => {
    const found = field();
    if (found === null) return;
    watch.disconnect();
    found.focus();
  });
  watch.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
    watch.disconnect();
  }, GIVE_UP_MS);
}
