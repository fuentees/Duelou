import { backupDatabase } from "./backup-lib.mjs";
try {
  const file = backupDatabase({
    dbPath: process.env.DB_PATH || "data/duelou.sqlite",
    outDir: process.env.BACKUP_DIR || "backups",
    keyHex: process.env.BACKUP_ENCRYPTION_KEY,
    keep: Number(process.env.BACKUP_KEEP || 14),
  });
  console.log(`Backup cifrado e verificado: ${file}`);
} catch {
  console.error(
    "Falha no backup. Verifique chave, banco, permissões e espaço livre.",
  );
  process.exitCode = 1;
}
