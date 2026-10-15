export const CJ_INTERVAL_MS = 1500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isCjAccessDisabled(error) {
  return /API access (?:has been|is) (?:disabled|suspended)|API.*permission.*revoked/i.test(error.message);
}

export function isCjRateLimit(error) {
  // A daily points shortage is not a per-second limit and must not be retried.
  return !/insufficient.*points|daily|quota/i.test(error.message)
    && (error.status === 429 || /QPS|too many requests|rate limit/i.test(error.message));
}

export function createCjRequestQueue({ reserve, wait = sleep, now = Date.now } = {}) {
  let nextAt = 0;
  const slot = reserve || (async () => {
    // Reserve before awaiting: concurrent calls cannot take the same slot.
    const at = Math.max(now(), nextAt);
    nextAt = at + CJ_INTERVAL_MS;
    return Math.max(0, at - now());
  });
  return async function run(request, { retry = true } = {}) {
    for (let attempt = 0; ; attempt++) {
      if (attempt) await wait(2000 * attempt);
      const delay = await slot();
      if (delay > 0) await wait(delay);
      try { return await request(); }
      catch (error) {
        if (!retry || !isCjRateLimit(error) || attempt >= 3) throw error;
      }
    }
  };
}
