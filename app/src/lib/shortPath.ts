/** A path as a plate's row or a header says it: more than four folders, the first two, an ellipsis and the last two. */
export function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length > 4 ? `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}` : path;
}

/** A path as the link card says it, as the prototype's capture does (`gno.land/r/…/bubble`, docs/prototype/source/app.js:1430; frames 26 and 104
 * per the removed helper's comment): whole up to 20 characters, else its middle folders cut, its last kept. */
export function cardPath(path: string): string {
  const [, , ...folders] = path.split("/");
  const last = folders.at(-1);
  return path.length <= 20 || folders.length < 2 || last === undefined ? path : `gno.land/r/…/${last}`;
}
