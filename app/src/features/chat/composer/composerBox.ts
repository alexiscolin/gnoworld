// The composer's box, which other parts of the page read: a member's editable box in the chat.
/** The composer's field in a form: the editable box. */
export const FIELD = '[role="textbox"]';
const MEMBER = `#chat ${FIELD}`;

/** The member's composer box standing in the chat now, if any. */
export const composerBox = (): HTMLElement | null => document.querySelector<HTMLElement>(MEMBER);
