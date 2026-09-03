

// Small helper: read a positive integer from an env var, with a fallback.
export function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  // Port for REST + WebSocket.
  port: intFromEnv("PORT", 3001),

  
  controlToken: process.env.CONTROL_TOKEN || "dev-token-change-me",


  staleAfterMs: intFromEnv("STALE_AFTER_MS", 5000),


  broadcastBatchMs: intFromEnv("BROADCAST_BATCH_MS", 50),
};


export const CONTROL_LIMITS = {
  fleetSize: { min: 1, max: 2000 },
  updateIntervalMs: { min: 50, max: 10000 },
};
