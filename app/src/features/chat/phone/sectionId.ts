// The section a hash names (#page), for the phone's sheets: an address or a chat line may carry a hash that does not decode.

/** The id `hash` names, decoded; none for an empty hash or one that does not decode. */
export function sectionId(hash: string): string | undefined {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}
