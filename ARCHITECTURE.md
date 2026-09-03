# Architecture

## The system in one picture

```
                        WebSocket  (one endpoint: /ws/robots)
 ┌──────────────┐   report messages   ┌─────────────────────────────┐
 │  simulator   │ ───────────────────► │           backend           │
 │  (producer)  │   {t, robot_id,     │  ┌────────────────────────┐  │
 │              │    x, y, status,    │  │  FleetState (a Map)    │  │
 │  N robots,   │    battery}         │  │  robot_id -> current   │  │
 │  tick every  │ ◄─────────────────── │  │  report + type +      │  │
 │  interval,   │   {type:"config"}   │  │  lastSeen + session}  │  │
 │  moves,      │   {type:"snapshot"} │  └───────────┬────────────┘  │
 │  drains/     │                      │   REST      │ batched       │
 │  charges     │                      │  GET /api/…  │ broadcast    │
 └──────────────┘                      │  POST /api/config (token)   │
                                        └──────────────┬──────────────┘
                                                       │ {type:"snapshot"} on connect
                                                       │ {type:"update", robots:[changed]}
                                                       ▼
                                        ┌─────────────────────────────┐
                                        │        dashboard (React)    │
                                        │  useFleet() hook: merges    │
                                        │  updates into a Map,        │
                                        │  auto-reconnect + backoff   │
                                        │      │                      │
                                        │  canvas map · trend chart · │
                                        │  robot list · detail · ctl  │
                                        └─────────────────────────────┘
```

## How one update travels: robot → screen

1. **The simulator** runs a `setInterval` (the update interval). Each tick, every
   robot possibly changes status (a small state machine), moves toward its
   target point if it's working, drains or charges its battery, and the process
   sends one JSON message per robot — exactly the `events.jsonl` contract:
   `{"t": 12.5, "robot_id": "r7", "x": 209.1, "y": 326.4, "status": "active", "battery": 41.2}`.
2. **The backend** receives it on the shared WebSocket endpoint `/ws/robots`.
   Any message carrying a `robot_id` is a report. `FleetState.ingest()` writes
   it into a `Map` (`robot_id → robot`) — O(1), with an out-of-order guard —
   and marks that robot dirty.
3. **Batching:** dirty robots are collected and, at most every
   `BROADCAST_BATCH_MS` (default 50 ms), pushed to *all* connected clients in a
   single `{type:"update", robots:[…]}` message. A burst of 1000 reports becomes
   1 dashboard update instead of 1000 writes.
4. **The dashboard**'s `useFleet()` hook merges the update array into its own
   `Map` (O(1) per robot) and publishes one new array to React.
5. **The map** is a `<canvas>`: on that state change it repaints the site image
   plus one dot per robot — 1,000 dots is a trivial paint. That's the pixel
   changing.

Why one WebSocket endpoint for producers and consumers: the message shapes are
already unambiguous (has `robot_id` ⇒ report; `type:"config"` ⇒ control;
`type:"snapshot"/"update"` ⇒ server→client), so a second endpoint or a second
protocol would have added moving parts without adding capability.

## What happens when things go wrong

**A robot (or the whole simulator) dies mid-task.**
No reports arrive for that robot. A 1-second `setInterval` in the backend runs
`FleetState.checkStale()`: any robot silent for longer than
`max(STALE_AFTER_MS, 3 × update interval)` is flipped to `offline` and
broadcast — so the operator *sees* the failure instead of a robot silently
vanishing. (Threshold scales with the interval so a deliberately slow robot is
never a false alarm.) Meanwhile the simulator process itself retries its
connection every 2 s, keeping the fleet's positions/batteries in memory, so a
reconnect resumes where it left off.

**Updates arrive late or out of order.**
Each connection is assigned a numeric session id at connect time and stored on
every robot (a number, never the connection object — objects are not safe to
`JSON.stringify` into API responses; that bug was caught and fixed in testing).
A report whose `t` is older than what we already have **from the same session**
is a late duplicate and is ignored. A report from a **different session** — a
restarted simulator whose `t` count went back to 0 — is always accepted and
resets the baseline. (A WebSocket over TCP is already in-order *within* a
connection, so ordering violations can only straddle a restart — which is
exactly the case the session check distinguishes. The first version of this
guard used a time-window heuristic and swallowed a fresh restart; the tests in
`backend/state.test.js` pin down both behaviors.)

**A dashboard client drops and reconnects.**
`useFleet()` reconnects with exponential backoff (1 s → 2 s → 4 s → … → 10 s,
reset on a clean open) and shows a "RECONNECTING…" badge in the meantime. On
connect the backend sends the full current state as `{type:"snapshot"}`, so the
client resyncs completely without any manual logic — a dropped connection heals
itself to full fidelity.

**The backend restarts.**
State is in memory by design: it's empty on boot. The simulator reconnects
within 2 s and the fleet rebuilds within one tick; dashboards reconnect within
1–2 s and get a (possibly empty-then-growing) snapshot. Nothing needs manual
intervention. The cost — history is lost on restart — is a deliberate scope
decision (see FINDINGS.md).

## If the fleet grew ten times (10,000 robots)

First things I'd change, in order:

1. **The batch payload.** At 10k robots one `update` batch is ~1.3 MB of JSON;
   that's the first wall (network + `JSON.stringify`). Fix: a compact binary
   protocol (or binary frames) for the update path — the same state, far less
   serialization.
2. **The DOM robot list.** The canvas map is already fine at 10k; the list of
   10k DOM rows re-rendering each tick is not. Fix: virtualize the list (render
   only visible rows) — a contained change.
3. **Run the simulator as its own service** (it currently co-deploys with the
   backend for free-tier simplicity) so production and load isolation are real.
4. **Consider per-robot sharding** of ingestion/broadcast only if a single
   Node process measurably can't keep up — the in-memory `Map` itself is not
   the bottleneck at anything near 10k at these update rates.
