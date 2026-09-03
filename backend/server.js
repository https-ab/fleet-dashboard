

import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

import { config, CONTROL_LIMITS, intFromEnv } from "./config.js";
import { FleetState } from "./state.js";


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


const liveConfig = {
  fleetSize: intFromEnv("FLEET_SIZE", 8),
  updateIntervalMs: intFromEnv("UPDATE_INTERVAL_MS", 1000),
};


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


app.get("/api/config", (req, res) => res.json(liveConfig));

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

  sendToAll({ type: "config", ...changes });
  console.log(`[backend] live config changed -> ${JSON.stringify(liveConfig)}`);
  res.json({ ok: true, config: liveConfig });
});

function inLimits(n, { min, max }) {
  return Number.isInteger(n) && n >= min && n <= max;
}


const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/robots" });

function sendToAll(obj) {
  const line = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(line);
  }
}

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


let nextSessionId = 1;
wss.on("connection", (ws) => {
  ws.sessionId = nextSessionId++;
  ws.isSimulator = false;

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

   
    if (!ws.isSimulator) {
      ws.isSimulator = true;
      ws.send(JSON.stringify({ type: "config", ...liveConfig }));
    }
  });

 
  ws.on("error", () => {});
});


setInterval(() => {

  const threshold = Math.max(config.staleAfterMs, 3 * liveConfig.updateIntervalMs);
  for (const robot of state.checkStale(threshold)) markDirty(robot);
}, 1000);


const DIST = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/ws")) {
      return next();
    }
    res.sendFile(fileURLToPath(new URL("../frontend/dist/index.html", import.meta.url)));
  });
}


server.listen(config.port, () => {
  console.log(`[backend] REST + WebSocket on http://localhost:${config.port}`);
  console.log(`[backend] WS endpoint:        ws://localhost:${config.port}/ws/robots`);
  if (existsSync(DIST)) {
    console.log(`[backend] serving frontend build at http://localhost:${config.port}`);
  }
});
