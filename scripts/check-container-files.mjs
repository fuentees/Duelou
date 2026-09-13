import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Exercise the Docker COPY file set without pretending to run Docker locally.
const root = mkdtempSync(join(tmpdir(), "duelou-container-files-"));
for (const line of readFileSync("server/Dockerfile", "utf8")
  .split(/\r?\n/)
  .filter((line) => line.startsWith("COPY "))) {
  const parts = line.split(/\s+/).slice(1),
    destination = resolve(root, parts.pop());
  assert.ok(
    destination.startsWith(root + "\\") || destination.startsWith(root + "/"),
  );
  for (const source of parts) {
    const sources = source.includes("*")
      ? readdirSync(source.split("/")[0])
          .filter((name) => name.endsWith(".mjs"))
          .map((name) => join(source.split("/")[0], name))
      : [source];
    if (
      parts.length === 1 &&
      !source.includes("*") &&
      destination.endsWith(".json")
    ) {
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(source, destination);
    } else {
      mkdirSync(destination, { recursive: true });
      for (const file of sources)
        copyFileSync(file, join(destination, basename(file)));
    }
  }
}
const entry = pathToFileURL(join(root, "server/server.mjs")).href;
const result = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `const {createApp}=await import(${JSON.stringify(entry)});const app=createApp(':memory:');app.db.prepare('SELECT 1').get();app.db.close();`,
  ],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(result.status, 0, result.stderr);
console.log(
  "PASS: arquivos copiados pelo Dockerfile carregam a API e suas migrações. Imagem Docker não executada.",
);
