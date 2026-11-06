// The page's EventSource, stood in for a test that wants the real stream client behind it (slice 9g): each source the page opens is kept
// with its url and its listeners, `emit` gives it a frame as the server would send it, and `close` is counted.
import { vi } from "vitest";

export class FakeSource {
  static opened: FakeSource[] = [];
  closed = 0;
  readyState = 1;
  private readonly listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.opened.push(this);
  }
  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed += 1;
  }
  /** A frame of `type` carrying `data` as JSON text. */
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }
  /** The names of the events a page listens to on this source. */
  heard() {
    return [...this.listeners.keys()].toSorted();
  }
}

/** Stands `FakeSource` in for EventSource and forgets the sources of the last test; `vi.unstubAllGlobals()` puts it back. */
export function fakeStream(): typeof FakeSource {
  FakeSource.opened = [];
  vi.stubGlobal("EventSource", FakeSource);
  return FakeSource;
}
