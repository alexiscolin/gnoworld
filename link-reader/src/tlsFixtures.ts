// Certificates for the transport tests, made once per run with the `openssl` command into a folder of the operating system's temporary
// directory (never into the repository: no key, even a test one, is committed). A CA, a leaf for each name, and a self-signed one for
// example.com. A missing or failing `openssl` fails the test with its message; nothing is skipped.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Certificates {
  ca: string;
  /** The key and certificate (PEM) of a leaf: "example.com", "other.test" or "selfsigned". */
  leaf: (name: string) => { key: string; cert: string };
  remove: () => void;
}

// One openssl command in `dir`; a missing or failing one fails the test with its message.
function openssl(dir: string, ...args: string[]): void {
  try {
    execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  } catch (error) {
    throw new Error(
      `the TLS tests need the openssl command to make their certificates: ${error instanceof Error ? error.message : "failed"}`,
      { cause: error },
    );
  }
}
const KEY = ["-newkey", "rsa:2048", "-nodes", "-days", "2"];

// A leaf for `name`, signed by the CA.
function leaf(dir: string, name: string): void {
  openssl(
    dir,
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    `${name}.key`,
    "-out",
    `${name}.csr`,
    "-subj",
    `/CN=${name}`,
  );
  writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${name}\nbasicConstraints=CA:FALSE\n`);
  openssl(
    dir,
    "x509",
    "-req",
    "-in",
    `${name}.csr`,
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-out",
    `${name}.pem`,
    "-days",
    "2",
    "-extfile",
    `${name}.ext`,
  );
}

export function makeCertificates(): Certificates {
  const dir = mkdtempSync(join(tmpdir(), "link-reader-tls-"));
  openssl(dir, "req", "-x509", ...KEY, "-keyout", "ca.key", "-out", "ca.pem", "-subj", "/CN=link-reader test CA");
  for (const name of ["example.com", "other.test"]) leaf(dir, name);
  openssl(
    dir,
    "req",
    "-x509",
    ...KEY,
    "-keyout",
    "selfsigned.key",
    "-out",
    "selfsigned.pem",
    "-subj",
    "/CN=example.com",
    "-addext",
    "subjectAltName=DNS:example.com",
  );
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  return {
    ca: read("ca.pem"),
    leaf: (name) => ({ key: read(`${name}.key`), cert: read(`${name}.pem`) }),
    remove: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
