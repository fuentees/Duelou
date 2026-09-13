import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Runs outside the request process so snapshot/encryption work cannot freeze a match.
export function startOperations({
  dbPath,
  env = process.env,
  launch = spawn,
  clock = Date.now,
  log = console.log,
}) {
  const enabled = !!env.BACKUP_ENCRYPTION_KEY || !!env.BACKUP_INTERVAL_MINUTES;
  const status = {
    state: enabled ? "pending" : "disabled",
    lastSuccess: null,
    lastAttempt: null,
    intervalMinutes: null,
  };
  if (!enabled) return { status, run: async () => false, stop: async () => {} };
  const minutes = Number(env.BACKUP_INTERVAL_MINUTES || 360);
  if (
    !/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || "") ||
    !Number.isFinite(minutes) ||
    minutes < 5 ||
    minutes > 10080
  )
    throw Error(
      "Configure a chave do backup e BACKUP_INTERVAL_MINUTES entre 5 e 10080.",
    );
  status.intervalMinutes = minutes;
  let pending = null,
    stopped = false;
  const run = () => {
    if (stopped) return Promise.resolve(false);
    if (pending) return pending;
    status.lastAttempt = clock();
    status.state = "running";
    pending = new Promise((resolveRun) => {
      let settled = false;
      const finish = (success) => {
        if (settled) return;
        settled = true;
        status.state = success ? "ok" : "failed";
        if (success) status.lastSuccess = clock();
        log(
          JSON.stringify({
            event: success ? "backup_ok" : "backup_failed",
            at: clock(),
          }),
        );
        resolveRun(success);
      };
      try {
        const worker = launch(
          process.execPath,
          [fileURLToPath(new URL("../scripts/backup-db.mjs", import.meta.url))],
          {
            env: {
              ...env,
              DB_PATH: resolve(dbPath),
              BACKUP_DIR: resolve(env.BACKUP_DIR || "backups"),
            },
            stdio: "ignore",
            windowsHide: true,
          },
        );
        worker.once("error", () => finish(false));
        worker.once("exit", (code) => finish(code === 0));
      } catch {
        finish(false);
      }
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
  const timer = setInterval(run, minutes * 60000);
  timer.unref();
  void run(); // A restart immediately exercises backup configuration again.
  return {
    status,
    run,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await pending;
    },
  };
}
