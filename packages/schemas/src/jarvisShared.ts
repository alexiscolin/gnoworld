// A fixed ask (what to do here, a room caught up, a function explained) is answered once for everyone who asks the same at the same place,
// from anyone's lines (D13508): its answer carries flight buttons alone, so a line someone wrote never steers Jarvis into a call that
// everyone then sees. A person's own question keeps both kinds. Jarvis drops them where it makes the answer, the door where it shares it.
import type { AnswerButton } from "./jarvis.ts";

/** Whether an ask is a fixed one (`here`, `catch-up`, `function`) whose answer is shared, against a person's own question. */
export const isFixedAsk = (ask: object): boolean => "ask" in ask;

/** The buttons of a shared answer: its flights, in order, and no action. */
export const flightsAlone = (buttons: readonly AnswerButton[]) =>
  buttons.filter((button): button is Extract<AnswerButton, { type: "fly" }> => button.type === "fly");
