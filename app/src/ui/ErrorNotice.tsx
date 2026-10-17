import type { ReactNode } from "react";

/** What a page shows in place of its content when it fails: a heading and a line, as an alert. */
export function ErrorNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
