// A 2D context for jsdom, which has none: it records each drawImage (the canvas drawn on, the one drawn from, the size) and gives nothing
// else. `restore` puts the browser's back.
export interface Drawn {
  readonly onto: HTMLCanvasElement;
  readonly from: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export function recordDrawing(): { drawn: Drawn[]; restore: () => void } {
  const proto = HTMLCanvasElement.prototype;
  const before = Object.getOwnPropertyDescriptor(proto, "getContext");
  const drawn: Drawn[] = [];
  Object.defineProperty(proto, "getContext", {
    configurable: true,
    value: function context(this: HTMLCanvasElement) {
      return {
        drawImage: (...[from, , , width, height]: [CanvasImageSource, number, number, number, number]) => {
          drawn.push({ onto: this, from, width, height });
        },
      };
    },
  });
  return {
    drawn,
    restore: () => {
      if (before === undefined) Reflect.deleteProperty(proto, "getContext");
      else Object.defineProperty(proto, "getContext", before);
    },
  };
}
