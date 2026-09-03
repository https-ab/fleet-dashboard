// server.js
// =====================================================================
// The backend, wired together:
//
//   simulator ──reports over WebSocket──► this server ──batched updates
//              over WebSocket──► dashboards
//                                  └──► REST: /api/robots, /api/robots/:id,
//                                          /api/config (GET + protected POST)
//
// One WebSocket endpoint (/ws/robots) serves BOTH sides: simulators
// connect and send reports, dashboards connect and receive state. The
// server just looks at each message: has robot_id => it's a report.
// =====================================================================

import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

import { config, CONTROL_LIMITS, intFromEnv } from "./config.js";
import { FleetState } from "./state.js";

// ---------------------------------------------------------------------
// 1) Current fleet state
// ---------------------------------------------------------------------
// Load robot types from the SAME roster the simulator uses
// (single source of truth — no copy to drift out of sync).
const ROSTER_URL = new URL("../simulator/robots.json", import.meta.url);
const knownTypes = {};
if (existsSync(fileURLToPath(ROSTER_URL))) {
  for (const r of JSON.parse(readFileSync(fileURLToPath(ROSTER_URL), "utf8"))) {
    knownTypes[r.robot_id] = r.robot_type;
  }
}

const state = new FleetState({
  staleAfterMs: config.staleAfterMs,
  knownTypes,
});

// What the simulators are currently told to run with. Starts from the
// environment (same defaults as simulator.js) and can be changed at
// runtime via POST /api/config — no redeploy.
const liveConfig = {
  fleetSize: intFromEnv("FLEET_SIZE", 8),
  updateIntervalMs: intFromEnv("UPDATE_INTERVAL_MS", 1000),
};

// ---------------------------------------------------------------------
// 2) REST API (Express)
// ---------------------------------------------------------------------
const app = express();
app.use(cors()); // the dev frontend runs on its own port — allow its fetches
app.use(express.json());

app.get("/", (req, res) =>
  res.json({
    name: "fleet-dashboard backend",
    try: [
      "GET /api/robots",
      "GET /api/robots/r1",
      "GET /api/config",
      "WS /ws/robots",
    ],
  })
);

app.get("/health", (req, res) => res.json({ ok: true, robots: state.size }));

// Full current state. Also handy for a dashboard to resync over HTTP.
app.get("/api/robots", (req, res) => res.json({ robots: state.snapshot() }));

// One robot (or 404).
app.get("/api/robots/:id", (req, res) => {
  const robot = state.get(req.params.id);
  if (!robot) {
    return res.status(404).json({ error: `no such robot: ${req.params.id}` });
  }
  res.json(robot);
});

// What the live controls are currently set to.
app.get("/api/config", (req, res) => res.json(liveConfig));

// CHANGE the live controls. Protected: the request must carry
// x-control-token matching CONTROL_TOKEN ("protected sensibly" — a
// shared secret, enough for an internal ops control).
app.post("/api/config", (req, res) => {
  if (req.get("x-control-token") !== config.controlToken) {
    return res.status(401).json({ error: "bad or missing x-control-token" });
  }
  const { fleetSize, updateIntervalMs } = req.body || {};
  const changes = {};

  if (fleetSize !== undefined) {
    if (!inLimits(fleetSize, CONTROL_LIMITS.fleetSize)) {
      return res
        .status(400)
        .json({ error: `fleetSize must be ${CONTROL_LIMITS.fleetSize.min}-${CONTROL_LIMITS.fleetSize.max}` });
    }
    liveConfig.fleetSize = fleetSize;
    changes.fleetSize = fleetSize;
  }
  if (updateIntervalMs !== undefined) {
    if (!inLimits(updateIntervalMs, CONTROL_LIMITS.updateIntervalMs)) {
      return res
        .status(400)
        .json({ error: `updateIntervalMs must be ${CONTROL_LIMITS.updateIntervalMs.min}-${CONTROL_LIMITS.updateIntervalMs.max}` });
    }
    liveConfig.updateIntervalMs = updateIntervalMs;
    changes.updateIntervalMs = updateIntervalMs;
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: "send fleetSize and/or updateIntervalMs" });
  }

  // Tell the simulators; they apply it without restarting.
  sendToAll({ type: "config", ...changes });
  console.log(`[backend] live config changed -> ${JSON.stringify(liveConfig)}`);
  res.json({ ok: true, config: liveConfig });
});

function inLimits(n, { min, max }) {
  return Number.isInteger(n) && n >= min && n <= max;
}

// ---------------------------------------------------------------------
// 3) WebSocket: one endpoint for simulators AND dashboards
// ---------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/robots" });

function sendToAll(obj) {
  const line = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(line);
  }
}

// ---- Batching (the load story) ----
// Instead of one WebSocket write per robot report, changed robots are
// collected in `pending` and pushed to all dashboards in ONE message,
// at most every broadcastBatchMs. 1000 robots reporting in a burst =>
// 1 dashboard update, not 1000.
let pending = new Map(); // robot_id -> robot
let batchTimer = null;
function markDirty(robot) {
  pending.set(robot.robot_id, robot);
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    const robots = [...pending.values()];
    pending = new Map();
    if (robots.length) sendToAll({ type: "update", robots });
  }, config.broadcastBatchMs);
}

// ---- Who just connected? ----
// Every connection gets a small numeric id. State stores THIS number
// (not the WebSocket object) — objects are not safe to JSON.stringify
// in API responses, numbers are.
let nextSessionId = 1;
wss.on("connection", (ws) => {
  ws.sessionId = nextSessionId++;
  ws.isSimulator = false;

  // Every client gets the full current state on connect. Dashboards use
  // it to (re)sync after a dropped connection; simulators ignore it.
  ws.send(JSON.stringify({ type: "snapshot", robots: state.snapshot() }));

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return; // not JSON — ignore
    }
    if (!msg || typeof msg !== "object" || !msg.robot_id) return; // not a report

    const { robot, ignored } = state.ingest(msg, ws.sessionId);
    if (!ignored) markDirty(robot);

    // The first report from a client identifies it as a simulator.
    // (We run one; several would just duplicate reports.) Give it the
    // current live config so a restart doesn't forget fleet size etc.
    if (!ws.isSimulator) {
      ws.isSimulator = true;
      ws.send(JSON.stringify({ type: "config", ...liveConfig }));
    }
  });

  // Without an "error" handler an exception is thrown and Node exits.
  ws.on("error", () => {});
});

// ---------------------------------------------------------------------
// 4) Stale check: a dropped robot connection => "offline"
// ---------------------------------------------------------------------
setInterval(() => {
  // 3 missed reports at the current interval, or the floor — whichever
  // is longer (so a deliberately slow interval doesn't cause false alarms).
  const threshold = Math.max(config.staleAfterMs, 3 * liveConfig.updateIntervalMs);
  for (const robot of state.checkStale(threshold)) markDirty(robot);
}, 1000);

// ---------------------------------------------------------------------
// 5) In production, also serve the built frontend (if it exists), so
//    ONE host can run everything: dashboard at /, API at /api.
// ---------------------------------------------------------------------
const DIST = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA catch-all: any other GET gets index.html (API/WS routes already
  // matched above, so they are untouched).
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }
    res.sendFile(fileURLToPath(new URL("../frontend/dist/index.html", import.meta.url)));
  });
}

// ---------------------------------------------------------------------
// 6) Start
// ---------------------------------------------------------------------
server.listen(config.port, () => {
  console.log(`[backend] REST + WebSocket on http://localhost:${config.port}`);
  console.log(`[backend] WS endpoint:        ws://localhost:${config.port}/ws/robots`);
  if (existsSync(DIST)) {
    console.log(`[backend] serving frontend build at http://localhost:${config.port}`);
  }
});
