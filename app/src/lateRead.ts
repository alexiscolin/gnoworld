// A read a page asks once it runs (8g): none in the page the build writes, none when the source does not say, asked again only when its key
// changes. `read` brings its own code in a chunk of its own (a dynamic import), so the first screen holds neither the reader nor its schema.
import { useEffect, useState } from "react";

/** What `read` gave for `key` once it came; undefined while it comes, with no key, or when it gave nothing. `read` is a module's own. */
export function useLateRead<T>(
  key: string | undefined,
  read: (key: string, signal: AbortSignal) => Promise<T | undefined>,
): T | undefined {
  const [held, setHeld] = useState<{ key: string; value: T | undefined }>();
  useEffect(() => {
    if (key === undefined) return undefined;
    const leaving = new AbortController();
    read(key, leaving.signal)
      .then((value) => {
        if (!leaving.signal.aborted) setHeld({ key, value });
      })
      .catch((error: unknown) => {
        if (!leaving.signal.aborted) reportError(error);
      });
    return () => {
      leaving.abort();
    };
  }, [key, read]);
  return held !== undefined && held.key === key ? held.value : undefined;
}
