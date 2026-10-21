// A file's digest as subresource integrity writes it, sha384 in base64: the one spelling the build
// writes into the worker's list and the worker checks a held file by (F342).
export async function integrity(bytes: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes));
  return `sha384-${btoa(String.fromCharCode(...digest))}`;
}
