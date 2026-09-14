import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const root = resolve("dist-web");
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const files = walk(root),
  scripts = files.filter((f) => f.endsWith(".js")),
  fonts = files.filter((f) => /\.(ttf|otf|woff2?)$/.test(f));
const sum = (list) => list.reduce((total, f) => total + statSync(f).size, 0);
const report = {
  javascriptBytes: sum(scripts),
  fontBytes: sum(fonts),
  fontFiles: fonts.length,
  totalBytes: sum(files),
};
assert.ok(scripts.length > 0, "Build ausente");
assert.ok(
  report.javascriptBytes <= 900000,
  "JavaScript acima do orçamento de 900 KB (inclui renderização dos personagens 3D)",
);
assert.equal(fonts.length, 1, "Somente a família Ionicons deve ser empacotada");
assert.ok(fonts[0].includes("Ionicons"));
assert.ok(report.totalBytes <= 2500000, "Build acima do orçamento de 2,5 MB");
console.log(JSON.stringify(report, null, 2));
