// simulator.js
// =====================================================================
// FAKE FLEET OF ROBOTS — the "producer" side of the system.
//
// Every UPDATE_INTERVAL_MS milliseconds this script sends ONE JSON
// report per robot to the backend over a WebSocket. The report has
// exactly the shape of one line in events.jsonl (the data contract):
//
//   {"t": 5.0, "robot_id": "r1", "x": 580.9, "y": 29.4,
//    "status": "active", "battery": 83.8}
//
// Tunables (environment variables — no code changes needed):
//   FLEET_SIZE          how many robots        (default: 8)
//   UPDATE_INTERVAL_MS  how often they report  (default: 1000)
//   BACKEND_WS_URL      where reports go       (default: ws://localhost:3001/ws/robots)
//
// The backend can ALSO change fleet size / interval at runtime by
// sending {"type":"config", ...} over the WebSocket — that is how the
// dashboard's live controls work (no redeploy).
//
// If the backend is not running, reports are printed to the console
// instead, so this file is fully testable on its own.
// =====================================================================

import { readFileSync } from "fs";
import WebSocket from "ws";

// ---------------------------------------------------------------------
// Site constants — from layout.png (900 x 560, origin top-left,
// 1 pixel = 1 unit, so no conversion needed).
// ---------------------------------------------------------------------
const SITE_W = 900;
const SITE_H = 560;
const MARGIN = 15; // robots never get closer than this to an edge

// ---------------------------------------------------------------------
// Configuration from environment (with safe fallbacks)
// ---------------------------------------------------------------------
const BACKEND_WS_URL =
  process.env.BACKEND_WS_URL || "ws://localhost:3001/ws/robots";

function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
let FLEET_SIZE = intFromEnv("FLEET_SIZE", 8);
let INTERVAL_MS = intFromEnv("UPDATE_INTERVAL_MS", 1000);

// ---------------------------------------------------------------------
// Statuses (the exact set from the data contract) + battery behaviour.
// BATTERY_PER_SEC: how fast the battery changes per second in that
// status (negative = draining, positive = charging).
// ---------------------------------------------------------------------
const BATTERY_PER_SEC = {
  idle: -0.015,
  active: -0.1,
  on_mission: -0.11,
  charging: +0.4,
  blocked: -0.02,
  error: -0.01,
  maintenance: -0.01,
  offline: -0.01,
};

// Statuses in which the robot moves toward its target.
const MOVING = new Set(["active", "on_mission"]);

// ---------------------------------------------------------------------
// Robot state. One plain object per robot — everything it "knows".
// ---------------------------------------------------------------------
// robots.json is the roster from the assignment package. We read it
// once. (new URL("...", import.meta.url) = "this file's folder", the
// ESM way of getting __dirname.)
const ROSTER = JSON.parse(
  readFileSync(new URL("./robots.json", import.meta.url), "utf8")
);

let robots = [];
let elapsedSec = 0; // used for the "t" field: seconds since start

function randomPoint() {
  return {
    x: MARGIN + Math.random() * (SITE_W - 2 * MARGIN),
    y: MARGIN + Math.random() * (SITE_H - 2 * MARGIN),
  };
}

function makeRobot(id, type, start) {
  const p = start || randomPoint();
  return {
    id,
    type,
    x: p.x,
    y: p.y,
    battery: 20 + Math.random() * 80, // start somewhere between 20% and 100%
    status: "idle",
    statusTicksLeft: 0, // ticks left in a temporary status (error, blocked, ...)
    target: randomPoint(), // where the robot is currently heading
    // real-world speed in px per SECOND (~2 px/s, like the sample log).
    // Per-tick distance is speed * interval, so a robot moves at the
    // same real speed no matter how often it reports.
    speed: 1.5 + Math.random() * 2,
  };
}

// Robot #i: use the real roster entry if it exists, otherwise invent one.
function robotFromRoster(i) {
  const r = ROSTER[i];
  if (r) {
    return makeRobot(r.robot_id, r.robot_type, { x: r.start.x, y: r.start.y });
  }
  const type = Math.random() < 0.5 ? "picker" : "hauler";
  return makeRobot("r" + (i + 1), type);
}

// Grow or shrink the fleet without restarting. Growing reuses the
// existing robots (so their positions/batteries survive); the extra
// robots beyond the roster are invented. Shrinking drops the tail.
function applyFleetSize(size) {
  FLEET_SIZE = size;
  while (robots.length < FLEET_SIZE) robots.push(robotFromRoster(robots.length));
  if (robots.length > FLEET_SIZE) robots.length = FLEET_SIZE;
}

// ---------------------------------------------------------------------
// Status changes — a small, readable state machine.
// Plausibility rules:
//   * low battery drags a robot into "charging"
//   * "charging" lasts until the battery is (nearly) full
//   * temporary statuses (blocked, error, maintenance) last a few ticks
//   * idle robots sometimes start working; working robots sometimes
//     idle, get blocked, or hit an error
// ---------------------------------------------------------------------
function nextStatus(r) {
  // 1) A robot charging stays charging until it is (nearly) full.
  if (r.status === "charging") return r.battery >= 95 ? "idle" : "charging";

  // 2) A temporary status runs for statusTicksLeft ticks, then ends.
  if (r.statusTicksLeft > 0) {
    r.statusTicksLeft--;
    if (r.statusTicksLeft > 0) return r.status;
    // temporary status over: an error sometimes turns into maintenance
    return r.status === "error"
      ? Math.random() < 0.5
        ? "maintenance"
        : "idle"
      : "idle";
  }

  // 3) Low battery: a robot that cannot work goes charging.
  if (r.battery < 10) return "charging";
  if (r.battery < 15 && Math.random() < 0.3) return "charging";

  // 4) Small probabilities for everything else.
  const roll = Math.random();
  if (r.status === "idle") {
    if (roll < 0.06) return "active"; // idle -> start working
    if (roll < 0.065) {
      r.statusTicksLeft = 3 + Math.floor(Math.random() * 5);
      return "offline"; // very rare heartbeat loss
    }
    return "idle";
  }
  if (r.status === "active" || r.status === "on_mission") {
    if (roll < 0.03) return r.status === "active" ? "on_mission" : "active";
    if (roll < 0.04) {
      r.statusTicksLeft = 3 + Math.floor(Math.random() * 5);
      return "blocked"; // e.g. stuck in a narrow aisle
    }
    if (roll < 0.045) {
      r.statusTicksLeft = 3 + Math.floor(Math.random() * 5);
      return "error";
    }
    if (roll < 0.05) return "idle";
    return r.status;
  }
  return "idle";
}

// ---------------------------------------------------------------------
// Movement: step toward the current target; on arrival pick a new one.
// Non-moving statuses (idle, charging, blocked, ...) do not move.
// ---------------------------------------------------------------------
function moveRobot(r) {
  if (!MOVING.has(r.status)) return;
  const step = r.speed * (INTERVAL_MS / 1000); // px to move this tick
  const dx = r.target.x - r.x;
  const dy = r.target.y - r.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= step) {
    r.target = randomPoint(); // arrived — pick somewhere new
    return;
  }
  r.x += (dx / dist) * step;
  r.y += (dy / dist) * step;
  // safety clamp: never leave the site
  r.x = Math.min(SITE_W - MARGIN, Math.max(MARGIN, r.x));
  r.y = Math.min(SITE_H - MARGIN, Math.max(MARGIN, r.y));
}

function updateBattery(r) {
  r.battery += BATTERY_PER_SEC[r.status] * (INTERVAL_MS / 1000);
  r.battery = Math.min(100, Math.max(0, r.battery));
}

// ---------------------------------------------------------------------
// Reports — exactly the events.jsonl shape, values rounded to 1 decimal
// ---------------------------------------------------------------------
const round1 = (n) => Math.round(n * 10) / 10;

function makeReport(r) {
  return {
    t: round1(elapsedSec),
    robot_id: r.id,
    x: round1(r.x),
    y: round1(r.y),
    status: r.status,
    battery: round1(r.battery),
  };
}

let ws = null;
function sendReport(report) {
  const line = JSON.stringify(report);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(line);
  } else {
    // Not connected: print instead, so the simulator works (and is
    // testable) even before the backend exists.
    console.log(line);
  }
}

// One full round: advance time, update every robot, send every report.
function runTick() {
  elapsedSec += INTERVAL_MS / 1000;
  for (const r of robots) {
    r.status = nextStatus(r);
    moveRobot(r);
    updateBattery(r);
    sendReport(makeReport(r));
  }
}

// ---------------------------------------------------------------------
// WebSocket connection to the backend (with auto-reconnect, because
// networks drop — the assignment explicitly asks us to handle that).
// ---------------------------------------------------------------------
function connect() {
  console.log(`[simulator] connecting to ${BACKEND_WS_URL} ...`);
  ws = new WebSocket(BACKEND_WS_URL);

  ws.on("open", () =>
    console.log("[simulator] connected — publishing reports")
  );

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return; // not JSON — ignore
    }
    // Live controls: {"type":"config", "fleetSize":200, "updateIntervalMs":500}
    if (msg.type === "config") {
      if (msg.fleetSize) applyFleetSize(msg.fleetSize);
      if (msg.updateIntervalMs) {
        INTERVAL_MS = msg.updateIntervalMs;
        restartTimer();
      }
      console.log(
        `[simulator] live config -> ${robots.length} robots, every ${INTERVAL_MS}ms`
      );
    }
  });

  ws.on("close", () => {
    console.log("[simulator] connection lost — retrying in 2s ...");
    setTimeout(connect, 2000);
  });

  ws.on("error", (err) => console.log("[simulator] ws error:", err.message));
}

// (Re)start the interval timer — used after a live interval change.
let timer = null;
function restartTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(runTick, INTERVAL_MS);
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
console.log(
  `[simulator] ${FLEET_SIZE} robots, one report every ${INTERVAL_MS}ms`
);
applyFleetSize(FLEET_SIZE);

// immediate first snapshot (t = 0) so the dashboard shows robots at once
for (const r of robots) sendReport(makeReport(r));

connect();
restartTimer();
