// Decifra um backup gerado por backup-db.mjs e grava o banco restaurado.
// Uso: node scripts/restore-db.mjs backups/duelou-<data>.sqlite.enc [destino.sqlite]
import { createDecipheriv } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , inputArg, destArg] = process.argv;
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;

if (!inputArg) {
  console.error(
    "Uso: node scripts/restore-db.mjs <backup.sqlite.enc> [destino.sqlite]",
  );
  process.exit(1);
}
if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
  console.error("Defina BACKUP_ENCRYPTION_KEY com a mesma chave usada no backup.");
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");
const dest = resolve(destArg || "data/duelou.restored.sqlite");

const raw = readFileSync(resolve(inputArg));
const iv = raw.subarray(0, 12);
const authTag = raw.subarray(12, 28);
const encrypted = raw.subarray(28);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, plain);
console.log(`Banco restaurado em ${dest} (${plain.length} bytes).`);
console.log(
  "Verifique o conteúdo antes de substituir o banco em produção — nunca sobrescreva direto.",
);
