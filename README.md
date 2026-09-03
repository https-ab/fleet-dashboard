# Fleet Management Dashboard

A small full-stack system for monitoring a fleet of mobile robots: simulated
robots publish position, battery and status live over WebSockets; a backend
ingests every report and keeps the fleet's current state; a React dashboard
shows the whole fleet moving on the site in real time, with trends, a
searchable robot list and live controls for the operator.

Built as the SDE-1 (full stack) hiring-challenge response for Peppermint Robotics.

## Live system

- Dashboard: `https://<to-be-filled>`
- Backend surface consumed by the dashboard: `https://<to-be-filled>/ws/robots` (WS) and `https://<to-be-filled>/api/robots` (REST)

## What's in the box

| folder      | what it is                                                        |
|-------------|-------------------------------------------------------------------|
| `simulator/`| The mock robots — a plain Node.js process (no framework) that runs the fleet and publishes one JSON report per robot per tick, exactly in the `events.jsonl` format. |
| `backend/`  | Express + `ws` service. Ingests every report, keeps current state in a `Map`, batch-broadcasts changes to dashboards over one WebSocket endpoint, and exposes REST for snapshots and a token-protected live-config control. |
| `frontend/` | Vite + React + Tailwind v4 dashboard. Canvas site map, trend chart with window controls, searchable robot list with a "needs attention" filter, robot detail panel, live controls. |

## Running locally (Linux)

Prerequisites: Node.js ≥ 18 (npm ships with it).

```bash
# install dependencies (once)
cd simulator && npm install && cd ..
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..

# terminal 1 — backend (port 3001)
cd backend && npm start

# terminal 2 — simulator
cd simulator && npm start

# terminal 3 — dashboard (port 5173, proxies /api and /ws to :3001)
cd frontend && npm run dev
```

On Windows the same commands work; the only differences are environment
variables (`set FLEET_SIZE=20` in cmd, `$env:FLEET_SIZE=20` in PowerShell)
and JSON quoting in curl (double quotes with escaped inner quotes in cmd).

## Configuration knobs

Every knob is an environment variable — no code changes.

| variable               | default                 | where        | meaning                                  |
|------------------------|-------------------------|--------------|------------------------------------------|
| `FLEET_SIZE`           | `8`                     | simulator    | how many robots to simulate (beyond the 8 in `robots.json` are invented) |
| `UPDATE_INTERVAL_MS`   | `1000`                  | simulator    | how often each robot reports             |
| `PAYLOAD_PAD_BYTES`    | `0`                     | simulator    | extra bytes per report (a fake `sensor_log` field) — to test the pipeline with larger payloads |
| `BACKEND_WS_URL`       | `ws://localhost:3001/ws/robots` | simulator  | where reports go                 |
| `PORT`                 | `3001`                  | backend      | REST + WebSocket port                    |
| `CONTROL_TOKEN`        | `dev-token-change-me`   | backend      | shared secret protecting the live config endpoint — **set a long random value in production** |
| `STALE_AFTER_MS`       | `5000`                  | backend      | a robot silent longer than this (or 3× the update interval, whichever is larger) is marked `offline` |
| `BROADCAST_BATCH_MS`   | `50`                    | backend      | max time between batched WS pushes to dashboards |

## AI tooling note

As the challenge asks, here is where I took help from AI: the simulator
(its movement, status and battery logic), the WebSocket parts (the
backend's live feed and the dashboard's connection hook), debugging when
something misbehaved, and asking it to explain the architecture so I
could understand and verify it myself. I can explain every part of this
submission.
