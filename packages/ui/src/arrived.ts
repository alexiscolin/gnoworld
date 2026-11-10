/** Calls `go` once the page's arrival lets what waits for it start (the root's `data-arrive="wait"`, set while its box waits for the scene, is
 * gone): at once where nothing waits. Returns what stops the wait. */
export function whenArrived(go: () => void): () => void {
  const root = document.documentElement;
  if (root.dataset["arrive"] !== "wait") {
    go();
    return () => undefined;
  }
  const watch = new MutationObserver(() => {
    if (root.dataset["arrive"] === "wait") return;
    watch.disconnect();
    go();
  });
  watch.observe(root, { attributes: true, attributeFilter: ["data-arrive"] });
  return () => {
    watch.disconnect();
  };
}
