// Authenticated players never share a bucket merely because they share a network.
export function rateLimiter(clock, maxKeys = 10000) {
  const buckets = new Map();
  let nextSweep = 0;
  return (key, maximum, windowMs = 60000) => {
    const now = clock();
    if (now >= nextSweep) {
      for (const [id, bucket] of buckets)
        if (bucket.until <= now) buckets.delete(id);
      nextSweep = now + 60000;
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && buckets.size >= maxKeys) {
        throw Object.assign(
          Error("Servidor ocupado. Tente novamente em um minuto."),
          { status: 429, retryAfter: 60 },
        );
      }
      bucket = { count: 0, until: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > maximum) {
      throw Object.assign(
        Error("Muitas solicitações. Aguarde antes de tentar novamente."),
        {
          status: 429,
          retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)),
        },
      );
    }
  };
}
