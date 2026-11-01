// A stream read up to a byte cap, shared by the browser's transport and the server's way out. The reader is a shape, not a Web
// type: core has no DOM.

/** The part of a stream's reader this needs. */
export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
  cancel(): Promise<void>;
}

function joined(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const whole = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return whole;
}

// A stream not read to its end is cancelled, so its connection is freed; one already closed or broken has nothing to free.
async function drop(reader: ByteReader): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    return;
  }
}

/** The stream's bytes, or null past `maxBytes`, the reader cancelled there and read no further. A read that fails rises. */
export async function cappedBytes(reader: ByteReader, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || value === undefined) return joined(chunks, size);
    size += value.byteLength;
    if (size > maxBytes) {
      await drop(reader);
      return null;
    }
    chunks.push(value);
  }
}
