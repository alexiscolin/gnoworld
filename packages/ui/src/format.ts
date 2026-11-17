// How the components write a number: grouped in English, the app's one language until the
// interface is translated, so a server and a browser group alike.
export function grouped(n: number) {
  return n.toLocaleString("en-US");
}

/** A number in three significant digits with its suffix (12.3K, 1.86B), for a figure that has no room for every digit. */
export function compact(n: number) {
  return n.toLocaleString("en-US", { notation: "compact", maximumSignificantDigits: 3 });
}
