import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  cpSync,
  statSync,
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
    if (source.includes("*")) {
      const sources = readdirSync(source.split("/")[0])
        .filter((name) => name.endsWith(".mjs"))
        .map((name) => join(source.split("/")[0], name));
      mkdirSync(destination, { recursive: true });
      for (const file of sources)
        copyFileSync(file, join(destination, basename(file)));
    } else if (parts.length === 1 && destination.endsWith(".json")) {
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(source, destination);
    } else if (statSync(source).isDirectory()) {
      // Diretório inteiro (ex.: "COPY shared/ ./shared/") — o conteúdo de
      // source vai pra dentro de destination, igual o COPY do Docker faz
      // quando os dois lados terminam em "/".
      mkdirSync(destination, { recursive: true });
      cpSync(source, destination, { recursive: true });
    } else {
      mkdirSync(destination, { recursive: true });
      copyFileSync(source, join(destination, basename(source)));
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
