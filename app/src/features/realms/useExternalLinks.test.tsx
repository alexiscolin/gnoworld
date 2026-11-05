// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { all, button, click, modals, mount, one } from "../../../tests/mount.tsx";
import { useExternalLinks } from "./useExternalLinks.tsx";

const OWN = "https://gno.land";

// One link drawn as the page draws it: an own address leaves the reader's anchor (undefined here), any other is a button.
function Page({ href, origin }: { href: string; origin: string | undefined }) {
  const { link, dialog } = useExternalLinks(origin);
  return (
    <>
      <p>{link(href, ["label"]) ?? <a href={href}>own</a>}</p>
      {dialog}
    </>
  );
}

beforeAll(modals);

describe("useExternalLinks: a link off gnoweb is a button that asks first", () => {
  it("leaves an address on gnoweb's own origin to the usual anchor", () => {
    const box = mount(<Page href={`${OWN}/r/gov/dao`} origin={OWN} />);
    expect(one(box, "a").getAttribute("href")).toBe(`${OWN}/r/gov/dao`);
    expect(all(box, "button, dialog")).toEqual([]);
  });

  it.each([
    ["a host that only starts alike", `${OWN}.evil.example/r/x`],
    ["another scheme", "http://gno.land/r/x"],
    ["another port", `${OWN}:8443/r/x`],
    ["another site", "https://example.org/"],
    ["an address that does not parse", "not a url"],
  ])("makes %s a button, no anchor, nothing opened until pressed", (_, href) => {
    const box = mount(<Page href={href} origin={OWN} />);
    expect(all(box, "a")).toEqual([]);
    expect(one(box, "button").title).toBe(href);
    expect(all(box, "dialog")).toEqual([]);
  });

  it("makes every link a button when the page knows no origin", () => {
    const box = mount(<Page href={`${OWN}/r/x`} origin={undefined} />);
    expect(all(box, "a")).toEqual([]);
    expect(one(box, "button").textContent).toBe("label");
  });

  it("makes a link whose origin does not parse a button", () => {
    const box = mount(<Page href={`${OWN}/r/x`} origin="not an origin" />);
    expect(all(box, "a")).toEqual([]);
    expect(one(box, "button").textContent).toBe("label");
  });

  it("opens the warning on press, and only its own link goes to the address", () => {
    const href = "https://example.org/path";
    const box = mount(<Page href={href} origin={OWN} />);
    click(one(box, "p button"));
    expect(one(box, "dialog").hasAttribute("open")).toBe(true);
    expect(box.textContent).toContain("This link goes to example.org");
    expect(all(box, "a").map((each) => each.getAttribute("href"))).toEqual([href]);
    expect(button(box, "Stay here")).toBeDefined();
  });
});
