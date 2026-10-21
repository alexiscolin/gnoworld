import { EmptyState } from "@gnoworld/ui";

/** What a page that failed shows: its title and its line as an alert, and the way home; `reload` when
 * the app may be what failed, so the way home loads the document again (F325). */
export function PageError({ title, line, reload = false }: { title: string; line: string; reload?: boolean }) {
  return (
    <div role="alert">
      <EmptyState level={1} title={title} line={line} action={{ label: "Back to the universe", href: "/", reload }} />
    </div>
  );
}
