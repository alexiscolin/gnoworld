// What the page and the server share of Jarvis in a room: the one nick its public answers are said under (RELAYMSG), whose "/" is a
// character no account can take, and how a question is found in a line that holds it.
export const JARVIS_NICK = "jarvis/bot";

/** The words without the marks a composer may put round them (`* _ ~` and backticks), on one line. */
export const plainWords = (text: string): string =>
  text
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
