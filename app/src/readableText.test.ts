import { expect, test } from "vitest";
import { readableText } from "./readableText.ts";

// The helper the route tests use to say "to the eye only": what a reader of the page can reach.
test("readableText leaves out whatever sits inside an aria-hidden element, nested or not", () => {
  expect(readableText('<div>a<p aria-hidden="true">b<span>c</span></p>d</div>')).toBe("ad");
  expect(readableText('<div aria-hidden="true"><p>x</p></div><p>y</p>')).toBe("y");
});

test("readableText keeps the text of an element that only looks like a hidden one, and reads past a void element", () => {
  expect(readableText('<p aria-hidden="false">kept</p><p class="aria-hidden">kept too</p>')).toBe("keptkept too");
  expect(readableText('<p aria-hidden="true"><img src="x" alt="">gone</p><br>after')).toBe("after");
});
