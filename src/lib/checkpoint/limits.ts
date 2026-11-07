// Rate limits per assistant: so one connected assistant can't flood the person with cards or hammer the store.
type Limits = { perMinute: number; perHour: number };

export function createAgentLimiter(limits: Limits, clock: () => number = Date.now) {
  const seen = new Map<string, number[]>();
  return {
    /** True if this assistant may go ahead now. Only tries that are let through are counted. */
    allow(agentId: string): boolean {
      const now = clock();
      const recent = (seen.get(agentId) ?? []).filter((t) => now - t < 3_600_000);
      const lastMinute = recent.filter((t) => now - t < 60_000).length;
      if (lastMinute >= limits.perMinute || recent.length >= limits.perHour) {
        seen.set(agentId, recent);
        return false;
      }
      recent.push(now);
      seen.set(agentId, recent);
      return true;
    },
  };
}
