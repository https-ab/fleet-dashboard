# Findings

Honest notes: what I chose, what it costs, where the system bends, and what I
left out. Numbers below are from actually running the system with its own
configuration knobs, not estimates.

## The tradeoffs I made

**1. Live transport: WebSocket (one endpoint, both directions).**
Robots push continuously, so REST polling was out (1,000 robots would have
meant 1,000 requests per second). SSE is one-way, so the dashboard direction
would have needed a second technology. Real robot fleets often use MQTT, but
that needs a broker — an extra server a small system doesn't need. One
WebSocket endpoint meant zero extra infrastructure, and the messages are easy
to tell apart: has `robot_id` ⇒ robot report, `type:"config"` ⇒ control
message.
*Cost:* no built-in message history — a dashboard that reconnects receives the
full state (snapshot) instead of "only what you missed."

**2. Live stuff on the WS, boring stuff on REST.**
Reports come in and updates go out on `/ws/robots`. REST is only for: the full
snapshot (`GET /api/robots` — also the resync tool), one robot, and the config
(get/post, token-protected). Both read the *same* in-memory state, so they
always agree; at worst they are one 50 ms batch apart.

**3. State: in-memory `Map`, no database.**
"The current fleet" is just the latest report per robot — it regenerates every
tick, so a database would only store a throwaway copy. The `Map` keeps
ingestion O(1) at any fleet size.
*Cost:* a backend restart leaves it empty for ~2 s until the simulator refills
it. Deliberate.

**4. Dashboard map: canvas, not 1,000 divs.**
One div per robot falls over around 800 robots (React re-rendering 800 moving
elements per tick). A canvas repaints the whole picture in one go; 1,000 dots
is a trivial draw.
*Cost:* no free per-robot DOM (tooltips, CSS) — selection and labels are
hand-drawn on the canvas.

**5. "Working" and "needs attention" — my own definitions.**
The assignment left these undefined on purpose, so I defined them: *working* =
`active` + `on_mission`; *needs attention* = `error`, `blocked`, `offline`, or
battery < 20 % while not charging. Both live in one file
(`frontend/src/lib/statuses.js`), so the map, list, detail and chart can't
disagree — and both are one-line changes if the operator wants different rules.

## Where the system degrades as the fleet grows (measured)

I turned the actual knobs on the running system:

| config | ingestion | `GET /api/robots` | WS feed to dashboard | backend CPU |
|---|---|---|---|---|
| 500 robots @ 1 s | 500 reports/s | 64 KB, ~3 ms | 1.2 msgs/s (batches of 500, ~63 KB each) | n/a |
| 1000 robots @ 250 ms | **4000 reports/s** | 132 KB, ~3 ms | 4.2 msgs/s (batches of 1000, ~129 KB each, ≈ 540 KB/s) | **~6 % of one core** |

Readings:

- **Batching is what makes this scale.** 4,000 reports/s in, 4.2 WebSocket
  messages/s out. Without the 50 ms batch, the dashboard would have received
  4,000 messages/s and React would have re-rendered 4,000 times/s.
- **Ingestion and REST are not the bottleneck** at 1,000 robots: O(1) map
  writes, ~3 ms snapshots, < 7 % of one core.
- **First wall (backend): the batch payload.** ~1.3 MB of JSON per batch at
  10k robots — serialization and network, not logic. I'd move the update path
  to a binary format before anything else.
- **First wall (frontend): the DOM robot list.** The canvas map is fine at
  1,000 dots (I watched it); a DOM list of 1,000 rows with battery bars,
  re-rendering every tick, is where React starts to hurt. Fix when needed:
  virtualize the list. The trend chart is canvas and is not a concern.

## What I cut (and what I'd build next)

**Cut deliberately:**

- **History endpoint** (`GET /robots/history/:id`) — this was the
  assignment's *optional* stretch goal, not a requirement. Building it means
  storing every report (a ring buffer or a database). I documented the cut
  here instead, which is exactly what the assignment asks for when you skip an
  optional part. The one real gap it leaves: the trend chart's data lives in
  the browser, so it resets on page reload.
- **Login / audit log** — the live config control uses a shared token plus
  input limits. That's proportionate for an internal control; a real product
  would add per-user login and an audit trail on config changes.
- **Pathfinding** — robots pick random targets rather than routing around the
  layout's aisles (the layout is a background image, and the assignment graded
  movement plausibility — speed, status, battery — which the model covers).

**What I'd build next, in order:**

1. History: an in-memory ring buffer first (no new dependencies); SQLite if
   history must survive restarts.
2. Virtualized robot list (needed before ~2–3k robots in the UI).
3. Binary update format for the WS feed.
4. Real site geometry: robots that respect the layout's aisles.
5. Per-robot battery/speed sparklines in the detail panel.
