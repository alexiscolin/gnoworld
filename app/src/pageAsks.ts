// Asks across the page between parts that import nothing of each other, each answered by its one owner: the log in, by the header's
// one account control (a second would watch the session and the wallet twice); who is here, by the chat's people (its info panel).
type Ask = "log-in" | "who-is-here";
const eventOf = (ask: Ask) => `gnoworld:${ask}`;

/** Asks the page's owner of `ask` to act. */
export const askFor = (ask: Ask): void => {
  window.dispatchEvent(new Event(eventOf(ask)));
};

/** Calls `act` at each ask of `ask`, until `signal` aborts. */
export function onAsked(ask: Ask, act: () => void, signal: AbortSignal): void {
  window.addEventListener(eventOf(ask), act, { signal });
}
