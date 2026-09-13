import { restoreDatabase } from "./backup-lib.mjs";
try {
  if (!process.argv[2]) throw Error("Arquivo ausente.");
  const file = restoreDatabase({
    input: process.argv[2],
    destination: process.argv[3] || "data/duelou.restored.sqlite",
    keyHex: process.env.BACKUP_ENCRYPTION_KEY,
  });
  console.log(`Banco restaurado e verificado: ${file}`);
} catch {
  console.error(
    "Restauração não concluída. Verifique arquivo, chave e se o destino já existe. Nenhum arquivo existente foi sobrescrito.",
  );
  process.exitCode = 1;
}
