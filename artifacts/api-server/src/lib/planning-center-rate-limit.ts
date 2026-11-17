// One shared gate for all products and callers using this process's PCO token.
// Database advisory locking serializes worker replicas; 429 deadlines are also
// persisted on the run by the page executor.
export class PlanningCenterRateLimit {
  private spacing = 2000;
  private nextAt = 0;
  private blockedUntil = 0;
  private gate: Promise<void> = Promise.resolve();
  private latestObservedRequestAt = Number.NEGATIVE_INFINITY;

  delay(now = Date.now()) {
    return Math.max(0, this.nextAt - now, this.blockedUntil - now);
  }

  observe(
    headers: Headers,
    status: number,
    retrySeconds: number,
    now = Date.now(),
    requestStartedAt = now,
  ) {
    const limit = Number(headers.get("X-PCO-API-Request-Rate-Limit"));
    const count = Number(headers.get("X-PCO-API-Request-Rate-Count"));
    const periodText = headers.get("X-PCO-API-Request-Rate-Period") ?? "";
    const period = /^(\d+(?:\.\d+)?)(?:\s+seconds?)?$/i.exec(periodText.trim());
    const seconds = period ? Number(period[1]) : 0;
    const valid =
      Number.isFinite(limit) &&
      limit > 0 &&
      headers.has("X-PCO-API-Request-Rate-Count") &&
      Number.isFinite(count) &&
      count >= 0 &&
      seconds > 0 &&
      Number.isFinite(seconds);
    // Ignore stale headers from an earlier concurrent request that completed
    // late; otherwise an old low count could undo newer, stricter pacing.
    const isLatestObservation = requestStartedAt >= this.latestObservedRequestAt;
    if (isLatestObservation) {
      this.latestObservedRequestAt = requestStartedAt;
      // Leave headroom for other PCO clients and adapt to endpoint-specific limits.
      this.spacing = valid
        ? Math.max(50, Math.ceil(((seconds * 1000) / limit) * 1.25))
        : 2000;
      if (valid && count >= limit * 0.8) this.spacing *= 2;
      this.nextAt = now + this.spacing;
    }
    if (valid && count >= limit)
      this.blockedUntil = Math.max(this.blockedUntil, now + seconds * 1000);
    if (status === 429) this.blockedUntil = Math.max(this.blockedUntil, now + retrySeconds * 1000);
  }

  async wait() {
    const slot = this.gate.then(async () => {
      // Recheck after waking: another response may have extended a 429 deadline.
      while (this.delay() > 0) await new Promise((resolve) => setTimeout(resolve, this.delay()));
      this.nextAt = Date.now() + this.spacing;
    });
    this.gate = slot.catch(() => {});
    await slot;
  }
}

export const planningCenterRateLimit = new PlanningCenterRateLimit();
