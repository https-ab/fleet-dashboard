

import { readFileSync } from "fs";
import WebSocket from "ws";

// ---------------------------------------------------------------------
// Site constants — from layout.png (900 x 560, origin top-left,
// 1 pixel = 1 unit, so no conversion needed).
// ---------------------------------------------------------------------
const SITE_W = 900;
const SITE_H = 560;
const MARGIN = 15; 


const BACKEND_WS_URL =
  process.env.BACKEND_WS_URL || "ws://localhost:3001/ws/robots";

function intFromEnv(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
let FLEET_SIZE = intFromEnv("FLEET_SIZE", 8);
let INTERVAL_MS = intFromEnv("UPDATE_INTERVAL_MS", 1000);


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


const MOVING = new Set(["active", "on_mission"]);


const ROSTER = JSON.parse(
  readFileSync(new URL("./robots.json", import.meta.url), "utf8")
);

let robots = [];
let elapsedSec = 0; 

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
    battery: 20 + Math.random() * 80, 
    status: "idle",
    statusTicksLeft: 0, 
    target: randomPoint(), 
  
    speed: 1.5 + Math.random() * 2,
  };
}


function robotFromRoster(i) {
  const r = ROSTER[i];
  if (r) {
    return makeRobot(r.robot_id, r.robot_type, { x: r.start.x, y: r.start.y });
  }
  const type = Math.random() < 0.5 ? "picker" : "hauler";
  return makeRobot("r" + (i + 1), type);
}


function applyFleetSize(size) {
  FLEET_SIZE = size;
  while (robots.length < FLEET_SIZE) robots.push(robotFromRoster(robots.length));
  if (robots.length > FLEET_SIZE) robots.length = FLEET_SIZE;
}


function nextStatus(r) {
  
  if (r.status === "charging") return r.battery >= 95 ? "idle" : "charging";

  
  if (r.statusTicksLeft > 0) {
    r.statusTicksLeft--;
    if (r.statusTicksLeft > 0) return r.status;
   
    return r.status === "error"
      ? Math.random() < 0.5
        ? "maintenance"
        : "idle"
      : "idle";
  }

  
  if (r.battery < 10) return "charging";
  if (r.battery < 15 && Math.random() < 0.3) return "charging";

  
  const roll = Math.random();
  if (r.status === "idle") {
    if (roll < 0.06) return "active"; // idle -> start working
    if (roll < 0.065) {
      r.statusTicksLeft = 3 + Math.floor(Math.random() * 5);
      return "offline"; 
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

function moveRobot(r) {
  if (!MOVING.has(r.status)) return;
  const step = r.speed * (INTERVAL_MS / 1000); 
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
    
    console.log(line);
  }
}


function runTick() {
  elapsedSec += INTERVAL_MS / 1000;
  for (const r of robots) {
    r.status = nextStatus(r);
    moveRobot(r);
    updateBattery(r);
    sendReport(makeReport(r));
  }
}


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
      return; 
    }

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


for (const r of robots) sendReport(makeReport(r));

connect();
restartTimer();
