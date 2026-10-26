// The labels the page's reactions take on Ergo (labeled-response, slice 4's 4d): each once, so Ergo's answer to one is
// known by it; the room of each one Ergo has not answered on this connection kept, its refusal told in that room.
export class Labels {
  #count = 0;
  readonly #rooms = new Map<string, string>();

  /** The label the next one takes. */
  next(): string {
    return `r${String(this.#count + 1)}`;
  }

  /** The next label went out, for a reaction in `room`. */
  sent(room: string): void {
    this.#count += 1;
    this.#rooms.set(`r${String(this.#count)}`, room);
  }

  /** Ergo answered a label: a refusal (404, ERR_CANNOTSENDTOCHAN: a +m room, a mute) is told in its reaction's room;
   * any answer, its echo included, forgets the label. */
  answered(label: string | undefined, command: string, refused: (room: string) => void): void {
    const room = label === undefined ? undefined : this.#rooms.get(label);
    if (label === undefined || room === undefined) return;
    this.#rooms.delete(label);
    if (command === "404") refused(room);
  }

  /** The connection ended: no answer to come for what it sent. */
  clear(): void {
    this.#rooms.clear();
  }
}
