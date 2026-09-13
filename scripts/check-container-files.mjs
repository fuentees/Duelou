import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  cpSync,
  statSync,
  existsSync,
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
// O Dockerfile também roda "npm ci" dentro de server/ antes de copiar o
// código (Ticket 14) — sem isso aqui, importar server.mjs falharia pra
// achar dependências reais como "ws", mesmo com todos os arquivos certos.
const serverDir = join(root, "server");
if (existsSync(join(serverDir, "package.json"))) {
  // shell:true é necessário pro Windows achar "npm" (que é um .cmd, não um
  // .exe) — seguro aqui porque os argumentos são todos literais fixos, sem
  // nada vindo de fora que pudesse ser interpretado pelo shell.
  const install = spawnSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: serverDir,
    shell: true,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(install.status, 0, install.stderr);
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
