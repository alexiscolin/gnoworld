// Records Adena's real answers (slice 9's answer 6): serves one page on this machine only, with the recorder
// built from app/src/lib/adena/record.ts, and writes what the page records to a file. Run: node app/recording/serve.mjs [file] [port]
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const file = process.argv[2] ?? "adena-recording.json";
const port = Number(process.argv[3] ?? 8765);
const onyx = JSON.parse(readFileSync(`${root}app/data/universes.json`, "utf8")).find((u) => u.id === "onyx");
const page = readFileSync(new URL("index.html", import.meta.url), "utf8").replace("__UNIVERSE__", JSON.stringify(onyx));

const output = await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    write: false,
    lib: { entry: `${root}app/src/lib/adena/record.ts`, name: "Recorder", formats: ["iife"], fileName: "recorder" },
  },
});
const bundle =
  [output]
    .flat()
    .flatMap((o) => o.output)
    .find((o) => o.type === "chunk")?.code ?? "";

createServer((request, response) => {
  if (request.method === "POST" && request.url === "/save") {
    const body = [];
    request.on("data", (chunk) => body.push(chunk));
    request.on("end", () => {
      writeFileSync(file, Buffer.concat(body));
      response.end("saved");
    });
  } else if (request.url === "/recorder.js") {
    response.setHeader("content-type", "text/javascript").end(bundle);
  } else {
    response.setHeader("content-type", "text/html; charset=utf-8").end(page);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Open http://localhost:${port} in the browser that has Adena. The answers are written to ${file}.`);
});
