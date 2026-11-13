// A bubble's ping waits till the arrival has calmed (D13001): its state, set beside the styles that read it (EarthSigns.module.css).

/** Marks the bubble `element` calm: its ping may ring. */
export function calmed(element: HTMLElement): void {
  element.dataset["calm"] = "";
}
