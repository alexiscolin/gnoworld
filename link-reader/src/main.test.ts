import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The link reader in the stack (docs/plans/link-previews.md §4, "A compromised reader", "The open way out leaking"): deploy/compose.yaml, the
// way out's list, the guard's rules and the image, read as text. Docker is refused in the sandbox: deploy/test-links.sh proves each by a request.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// A key's block of a YAML mapping at an indentation, up to the next key at that indentation or less; empty if none.
function block(text: string, indent: number, key: string): string {
  const pad = " ".repeat(indent);
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `${pad}${key}:` || line.startsWith(`${pad}${key}: `));
  if (start === -1) return "";
  const end = lines.findIndex(
    (line, at) => at > start && line.trim() !== "" && !line.trimStart().startsWith("#") && line.search(/\S/) <= indent,
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}
const keysOf = (text: string, indent: number) =>
  [...text.matchAll(new RegExp(`^ {${String(indent)}}([A-Za-z_][A-Za-z0-9_-]*):`, "gm"))].map(
    (match) => match[1] ?? "",
  );
const compose = () => read("deploy/compose.yaml");
const service = (name: string) => block(block(compose(), 0, "services"), 2, name);
const setting = (name: string, key: string) =>
  new RegExp(`^ {6}${key}: (.*)$`, "m").exec(block(service(name), 4, "environment"))?.[1]?.trim();
const networksOf = (name: string) => {
  const listed = block(service(name), 4, "networks");
  const inline = /^ {4}networks: \[([^\]]*)\]$/m.exec(listed)?.[1];
  return (inline === undefined ? keysOf(listed, 6) : inline.split(",").map((one) => one.trim())).sort();
};

describe("the link reader's container", () => {
  it("is in the links profile alone, locked down like every service, on its two networks and no other", () => {
    const reader = service("link_reader");
    expect(reader).toMatch(/^ {4}profiles: \[links\]$/m);
    expect(reader).toMatch(/^ {4}<<: \*locked$/m);
    expect(networksOf("link_reader")).toEqual(["links", "links_out"]);
  });

  it("runs as a user of its own, no other service's", () => {
    expect(service("link_reader")).toMatch(/^ {4}user: "65530:65530"$/m);
    const others = [
      "web",
      "ergo",
      "server",
      "jarvis",
      "jarvis_reader",
      "egress",
      "egress_jarvis",
      "egress_reader",
      "egress_links",
    ].map((name) => /^ {4}user: "(\d+:\d+)"$/m.exec(service(name))?.[1]);
    expect(others).not.toContain("65530:65530");
  });

  it("holds no secret, no volume, no file of the host, no published port, no added capability", () => {
    const reader = service("link_reader");
    expect(reader).not.toMatch(/^ {4}(secrets|volumes|ports|cap_add|privileged|devices|extra_hosts|sysctls):/m);
    expect(reader).not.toMatch(/_FILE:|API_KEY|PEPPER|PASSWORD/);
    expect(reader).toMatch(/^ {4}cpus: \S+$/m);
    expect(reader).toMatch(/^ {4}mem_limit: \S+$/m);
    expect(reader).toMatch(/^ {4}pids_limit: \d+$/m);
  });

  it("goes out through the link way out on 4754, serves at most 2 pages at once, and listens on its address of the network it shares with the server", () => {
    expect(setting("link_reader", "LINKS_PROXY")).toBe("guard:4754");
    expect(setting("link_reader", "LINKS_MAX")).toBe('"2"');
    expect(setting("link_reader", "LINKS_LISTEN")).toBe("${LINK_READER_ADDRESS:-172.30.101.10}:8084");
    expect(setting("link_reader", "HTTPS_PROXY")).toBeUndefined();
  });

  it("is reached by the server alone: the server is on its network, and nothing else of the demo is", () => {
    expect(networksOf("server")).toContain("links");
    const joined = keysOf(block(compose(), 0, "services"), 2).filter((name) => networksOf(name).includes("links"));
    expect(joined.sort()).toEqual(["link_reader", "server"]);
    const out = keysOf(block(compose(), 0, "services"), 2).filter((name) => networksOf(name).includes("links_out"));
    expect(out.sort()).toEqual(["guard", "link_reader"]);
  });

  it("tells the server where it is, and keeps the cards off by default", () => {
    expect(setting("server", "LINK_READER_URL")).toBe("http://link_reader:8084");
    expect(setting("server", "LINK_CARDS")).toBe("${LINK_CARDS:-0}");
    expect(setting("server", "NO_PROXY")).toContain("link_reader");
    expect(block(service("server"), 4, "secrets")).not.toContain("link");
  });

  // The reader asks no key on POST /card: it holds no secret by design, and the network is its gate (L9). Only the server may be on it.
  it("is gated by its network alone: no other service joins `links`, and no secret exists to ask a key with", () => {
    const joined = keysOf(block(compose(), 0, "services"), 2).filter((name) => networksOf(name).includes("links"));
    expect(joined.sort()).toEqual(["link_reader", "server"]);
    expect(block(compose(), 0, "secrets")).not.toMatch(/link/i);
  });

  it("has two networks that are internal and have no gateway", () => {
    for (const network of ["links", "links_out"]) {
      const text = block(block(compose(), 0, "networks"), 2, network);
      expect(text).toMatch(/^ {4}internal: true$/m);
      expect(text).toMatch(/gateway_mode_ipv4: isolated/);
      expect(text).toMatch(/gateway_mode_ipv6: isolated/);
    }
  });

  it("has an image that builds from its own workspace and ships no test, no secret and no other service's code", () => {
    const image = read("deploy/link-reader/Dockerfile");
    expect(image).toMatch(/^USER 65530:65530$/m);
    expect(image).toMatch(/^COPY link-reader\/src link-reader\/src$/m);
    expect(image).toMatch(/--filter @gnoworld\/link-reader\.\.\./);
    expect(image).not.toMatch(/COPY (server|jarvis|app|deploy|scripts)\b/);
    expect(image).not.toMatch(/ENV .*(KEY|SECRET|PASSWORD)/i);
    expect(image).toMatch(/--disallow-code-generation-from-strings/);
    expect(read(".dockerignore").split("\n")).toEqual(
      expect.arrayContaining([
        "!link-reader/package.json",
        "!link-reader/src",
        "link-reader/src/**/*.test.ts",
        "link-reader/src/testdata",
        "link-reader/src/testImages.ts",
        "link-reader/src/memory.ts",
        "link-reader/src/tlsFixtures.ts",
        "!deploy/egress/links-acl.yaml",
      ]),
    );
  });
});

describe("the link way out", () => {
  const egress = () => service("egress_links");
  it("is smokescreen on 4754 with its own list, in the links profile, in the guard's network, alone", () => {
    expect(egress()).toMatch(/^ {4}profiles: \[links\]$/m);
    expect(egress()).toMatch(/^ {4}network_mode: service:guard$/m);
    expect(egress()).toMatch(/^ {8}"4754",$/m);
    expect(egress()).toMatch(/^ {8}"\/etc\/smokescreen\/links-acl\.yaml",$/m);
    expect(egress()).toMatch(/^ {6}test: \[CMD, \/probe, "127\.0\.0\.1:4754"\]$/m);
    expect(read("deploy/egress/Dockerfile")).toMatch(/^COPY .* deploy\/egress\/links-acl\.yaml \/out\/etc\/$/m);
  });

  it("opens to any public name, with no list and no wildcard, and nothing else: no service rule", () => {
    const acl = read("deploy/egress/links-acl.yaml");
    expect(keysOf(acl, 0)).toEqual(["version", "services", "default"]);
    expect(acl).toMatch(/^services: \[\]$/m);
    expect(keysOf(block(acl, 0, "default"), 2)).toEqual(["project", "action"]);
    expect(block(acl, 0, "default")).toMatch(/^ {2}action: open$/m);
    expect(acl).not.toMatch(/^\s+- /m);
  });

  it("keeps the other three lists closed: no `open` anywhere else", () => {
    for (const path of ["acl.yaml", "jarvis-acl.yaml", "reader-acl.yaml"]) {
      expect(read(`deploy/egress/${path}`)).toMatch(/^ {2}action: enforce$/m);
      expect(read(`deploy/egress/${path}`)).not.toMatch(/action: open/);
    }
  });

  it("refuses private addresses after resolving, for every list, the file they share", () => {
    expect(read("deploy/egress/config.yaml")).toMatch(/^unsafe_allow_private_ranges: false$/m);
    expect(read("deploy/egress/config.yaml")).not.toMatch(/^unsafe_allow_private_ranges: true/m);
  });

  it("takes 4754 from the link reader's network alone, in the guard", () => {
    const guard = read("deploy/guard/guard.sh");
    expect(guard).toContain("-A INPUT -i $links_out -p tcp --dport 4754 -j ACCEPT");
    expect(guard).toContain("-A INPUT -i $links_out -j REJECT");
    expect(guard).toContain("-A INPUT -p tcp --dport 4754 -j REJECT");
    expect(guard).toContain("-A OUTPUT -o $links_out -p tcp --sport 4754 -m conntrack --ctstate ESTABLISHED -j ACCEPT");
    expect(guard).toMatch(/links_out=\$\(ip -4 -o addr show to "\$LINKS_OUT_ADDRESS\/32"/);
    // Still every private range refused before the public 80 and 443 for each way out.
    expect(guard).toContain("10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12");
    expect(guard).toContain("multiport --dports 80,443 -j ACCEPT");
    expect(service("guard")).toMatch(/^ {6}LINKS_OUT_ADDRESS: \$\{GUARD_LINKS_ADDRESS:-172\.30\.103\.2\}$/m);
    expect(keysOf(block(service("guard"), 4, "networks"), 6)).toContain("links_out");
  });

  it("names every setting compose reads in deploy/.env.example", () => {
    const named = new Set(
      [...compose().matchAll(/\$\{(LINK[A-Z_]*|GUARD_LINKS_ADDRESS):[-?]/g)].map((match) => match[1] ?? ""),
    );
    for (const name of named) expect(read("deploy/.env.example"), name).toMatch(new RegExp(`^# ${name}=`, "m"));
  });
});
