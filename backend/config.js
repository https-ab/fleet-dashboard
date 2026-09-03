// config.js
// =====================================================================
// Every setting in ONE place. Each value can be overridden with an
// environment variable — that's how things change on a server (or when
// we deploy) without touching code.
//
//   PORT=3001 CONTROL_TOKEN=... node server.js
// =====================================================================

// Small helper: read a positive integer from an env var, with a fallback.
export function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  // Port for REST + WebSocket.
  port: intFromEnv("PORT", 3001),

  // Shared secret that protects POST /api/config (the live controls).
  // In production, set CONTROL_TOKEN to something long and random.
  controlToken: process.env.CONTROL_TOKEN || "dev-token-change-me",

  // A robot that has not reported for this long is marked "offline".
  // (The server uses the larger of this or 3x the current update
  // interval, so a slow-but-alive robot is never falsely marked down.)
  staleAfterMs: intFromEnv("STALE_AFTER_MS", 5000),

  // When reports arrive, we don't push a WebSocket message to the
  // dashboards for EACH one — we collect them and push in ONE message
  // at most every this many ms. A burst of 1000 reports becomes 1
  // dashboard update.
  broadcastBatchMs: intFromEnv("BROADCAST_BATCH_MS", 50),
};

// Hard sanity limits for the live controls, so a typo (fleetSize: 999999
// or updateIntervalMs: 3) cannot kill the demo.
export const CONTROL_LIMITS = {
  fleetSize: { min: 1, max: 2000 },
  updateIntervalMs: { min: 50, max: 10000 },
};
