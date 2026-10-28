// A thread's panel with its composer (slice 4's 4d threads): one lazy chunk, asked once a thread is opened, so a page
// that opens none never loads the Writer and what it brings (ADR-0001 §12; Threading.tsx).
import { Thread, type ThreadProps } from "./Thread.tsx";
import { Writer, type WriterProps } from "./Writer.tsx";

export function ThreadBody({ writer, ...thread }: Omit<ThreadProps, "composer"> & { writer: WriterProps }) {
  return <Thread {...thread} composer={<Writer {...writer} />} />;
}
