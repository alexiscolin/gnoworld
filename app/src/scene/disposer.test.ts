import { describe, expect, it, vi } from "vitest";
import { Disposer } from "./disposer.ts";

const resource = () => ({ dispose: vi.fn<() => void>() });

describe("Disposer", () => {
  it("hands back what it is given", () => {
    const owned = resource();
    expect(new Disposer().add(owned)).toBe(owned);
  });

  it("disposes what it owns, last made first", () => {
    const order: string[] = [];
    const disposer = new Disposer();
    disposer.add({ dispose: () => order.push("geometry") });
    disposer.add({ dispose: () => order.push("material") });
    disposer.dispose();
    expect(order).toEqual(["material", "geometry"]);
  });

  it("disposes each once, however often it is told", () => {
    const owned = resource();
    const disposer = new Disposer();
    disposer.add(owned);
    disposer.dispose();
    disposer.dispose();
    expect(owned.dispose).toHaveBeenCalledTimes(1);
  });

  it("aborts its signal, so every listener given it goes", () => {
    const disposer = new Disposer();
    const target = new EventTarget();
    const heard = vi.fn();
    target.addEventListener("x", heard, { signal: disposer.signal });
    disposer.dispose();
    target.dispatchEvent(new Event("x"));
    expect(disposer.signal.aborted).toBe(true);
    expect(heard).not.toHaveBeenCalled();
  });

  it("disposes at once what arrives after it was disposed: a part still loading then", () => {
    const disposer = new Disposer();
    disposer.dispose();
    const late = resource();
    disposer.add(late);
    expect(late.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the rest when one fails, and then says so", () => {
    const failing = new Error("the driver refused");
    const before = resource();
    const after = resource();
    const disposer = new Disposer();
    disposer.add(before);
    disposer.add({
      dispose: () => {
        throw failing;
      },
    });
    disposer.add(after);
    expect(() => {
      disposer.dispose();
    }).toThrow(failing);
    expect(before.dispose).toHaveBeenCalledTimes(1);
    expect(after.dispose).toHaveBeenCalledTimes(1);
    expect(disposer.signal.aborted).toBe(true);
  });
});
