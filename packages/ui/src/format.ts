// How the components write a number: grouped in English, the app's one language until the
// interface is translated, so a server and a browser group alike.
export function grouped(n: number) {
  return n.toLocaleString("en-US");
}
