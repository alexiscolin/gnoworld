// The one reader of what the build writes for a host (src/csp.ts): `_headers` and nginx's table. The host that serves the
// build for the journeys, the journeys and the build tests all read them here, so a change of the format is made once (F2457).

const POLICY = /^ {2}Content-Security-Policy: (.+)$/;
const ROW = /^\s*("?)([^"\s]+)\1\s+"([^"]*)";$/;

/** The policy a `_headers` line sets, or undefined when it is none (a path, a detach, another header). */
export function policyLine(line) {
  return POLICY.exec(line)?.[1];
}

/** Whether a `_headers` line detaches the Content-Security-Policy that an earlier rule set. */
export function isDetach(line) {
  return line === "  ! Content-Security-Policy";
}

/** The rules of a `_headers` file in order: an address, then its indented header lines. */
export function headerBlocks(text) {
  const blocks = [];
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) blocks.push([line, []]);
    else if (line.trim() !== "") blocks.at(-1)?.[1].push(line);
  }
  return blocks;
}

/** The policy line of each rule of a `_headers` file by its address; a detach (`! Content-Security-Policy`) is no policy. */
export function headerRules(text) {
  const found = new Map();
  for (const [address, lines] of headerBlocks(text)) {
    for (const line of lines) {
      const policy = policyLine(line);
      if (policy !== undefined) found.set(address, policy);
    }
  }
  return found;
}

/** The rows of nginx's map by key, the key quoted or not (`default` is bare); a directive is no row. */
export function nginxTable(text) {
  const found = new Map();
  for (const line of text.split("\n")) {
    const match = ROW.exec(line);
    if (match !== null) found.set(match[2] ?? "", match[3] ?? "");
  }
  return found;
}
