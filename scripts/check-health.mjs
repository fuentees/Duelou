// One-shot probe for an external scheduler. Alerts are structured stderr + exit 1.
// No messages or secrets are sent to third parties.
export async function checkHealth(
  url,
  {
    timeoutMs = 5000,
    requireBackup = false,
    fetcher = fetch,
    now = Date.now(),
  } = {},
) {
  const start = performance.now();
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json();
    const backup = data.backup;
    const backupOk =
      backup?.lastSuccess &&
      backup.lastSuccess >= now - (backup.intervalMinutes * 60000 + 300000) &&
      backup.state !== "failed";
    return {
      ok: response.ok && data.ok === true && (!requireBackup || !!backupOk),
      latencyMs: Math.round(performance.now() - start),
      backup: backup?.state || "unknown",
    };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: "unreachable_or_invalid_response",
    };
  }
}
if (
  process.argv[1] &&
  import.meta.url ===
    (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const result = await checkHealth(
    process.env.HEALTH_URL || "http://127.0.0.1:3001/health",
    { requireBackup: process.env.REQUIRE_BACKUP === "true" },
  );
  (result.ok ? console.log : console.error)(
    JSON.stringify({
      event: result.ok ? "health_ok" : "health_failed",
      ...result,
    }),
  );
  if (!result.ok) process.exitCode = 1;
}
