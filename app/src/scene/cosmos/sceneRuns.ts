// Whether the page's scene canvas runs: a lost context or a covered page stops the frames that would hide what stands over it, the labels
// and a Plan's names (7v).

/** Tells `told` whether the scene's canvas runs, now and at each change of it; nothing where the page holds no canvas. */
export function watchScene(document: Document, told: (running: boolean) => void): MutationObserver | undefined {
  const canvas = document.querySelector("canvas[data-scene]");
  if (canvas === null) return undefined;
  const running = () => {
    told(canvas.getAttribute("data-scene") === "on");
  };
  const watching = new MutationObserver(running);
  watching.observe(canvas, { attributes: true, attributeFilter: ["data-scene"] });
  running();
  return watching;
}
