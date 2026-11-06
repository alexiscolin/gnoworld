// jsdom has no popover API, which the Flash and the buttons' names use: a stand-in that does nothing, for a test's setup.
export function standInPopovers(): void {
  for (const method of ["showPopover", "hidePopover", "togglePopover"])
    Object.defineProperty(HTMLElement.prototype, method, { configurable: true, value: () => undefined });
}
