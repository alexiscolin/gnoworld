import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { worldsFile } = vi.hoisted(() => ({ worldsFile: vi.fn() }));
vi.mock("../worldsFile.ts", () => ({ worldsFile }));
import { clientLoader } from "./cosmos.tsx";

const at = (path: string) => ({ request: new Request(`https://gno.world${path}`) });
beforeEach(() => {
  worldsFile.mockResolvedValue({ worlds: [{ namespace: "gnolang" }] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a phone has no cosmos: its views go to its chat before any file is read, a computer's stay", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(max-width: 899px)" }));
  const gone = await clientLoader(at("/s/defrewr"));
  expect(gone).toBeInstanceOf(Response);
  expect(gone).toMatchObject({ status: 302 });
  expect((gone as Response).headers.get("Location")).toBe("/earth?chat=full");
  expect(worldsFile).not.toHaveBeenCalled();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  await expect(clientLoader(at("/universe"))).resolves.toBeDefined();
});

test("a system page for a namespace with no world in the file answers 404, never one world", async () => {
  await expect(clientLoader(at("/s/defrewr"))).rejects.toMatchObject({ init: { status: 404 } });
});

test("a namespace with a world, the Earth's own and the galaxy load", async () => {
  await expect(clientLoader(at("/s/gnolang"))).resolves.toBeDefined();
  await expect(clientLoader(at("/s/gnoland"))).resolves.toBeDefined();
  await expect(clientLoader(at("/universe"))).resolves.toBeDefined();
});

test("a worlds' file that did not come proves nothing: the page loads", async () => {
  worldsFile.mockResolvedValue(undefined);
  await expect(clientLoader(at("/s/defrewr"))).resolves.toBeDefined();
});
