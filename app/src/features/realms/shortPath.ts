/** A path as a header or a row says it: more than four folders, the first two, an ellipsis and the last two. */
export function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length > 4 ? `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}` : path;
}
