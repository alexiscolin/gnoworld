// The one hash every place, look and sky of space is drawn from: the same id always gives the same number.
/** FNV-1a of `text`, then `salt` mixed in: a number in [0, 1). */
export function hashOf(text: string, salt = 0): number {
  let hash = 0x811c9dc5 ^ salt;
  for (let at = 0; at < text.length; at += 1) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}
