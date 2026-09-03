// state.js
// =====================================================================
// The single source of truth for the fleet's CURRENT state.
//
// Why a Map? robot_id -> robot object gives O(1) lookup and update no
// matter how many robots exist. Ingestion therefore does not get slower
// as the fleet grows — an explicit requirement of the assignment.
//
// This file knows NOTHING about WebSockets or HTTP. It only knows "a
// report arrived" and "who went stale". Keeping it free of networking
// makes it easy to test (that's what the test file exercises).
// =====================================================================

export class FleetState {
  constructor({ staleAfterMs = 5000, knownTypes = {} } = {}) {
    this.robots = new Map(); // robot_id -> { ...report, type, lastSeen }
    this.staleAfterMs = staleAfterMs;
    // robot_id -> "picker"|"hauler", loaded from robots.json. The report
    // format itself doesn't carry the type, so we look it up here.
    this.knownTypes = knownTypes;
  }

  // A report arrived (one line of the events.jsonl format):
  //   { t, robot_id, x, y, status, battery }
  // `session` is a small ID identifying the connection the report came
  // from (assigned in server.js). We store the ID, never the connection
  // object itself — API responses are JSON, and serializing a WebSocket
  // object would dump its internals into every robot.
  // Returns { robot, ignored } — ignored is true when we kept the
  // fresher data we already had.
  ingest(report, session) {
    const prev = this.robots.get(report.robot_id);

    if (prev && prev.session === session) {
      // Same connection that last reported this robot. A WebSocket over
      // TCP delivers in order, so an OLDER timestamp from the same
      // session can only be a late duplicate — keep the fresher data.
      if (
        typeof report.t === "number" &&
        typeof prev.t === "number" &&
        report.t < prev.t
      ) {
        return { robot: prev, ignored: true };
      }
    }
    // Brand-new robot, or a DIFFERENT session (e.g. the simulator
    // restarted and its "t" counter went back to 0): accept, and reset
    // the timestamp baseline for this robot.

    const robot = {
      ...report,
      type: prev?.type ?? this.knownTypes[report.robot_id] ?? null,
      lastSeen: Date.now(),
      session,
    };
    this.robots.set(report.robot_id, robot);
    return { robot, ignored: false };
  }

  // Robots whose connection dropped stop reporting. Run this
  // periodically; anything silent for too long is marked "offline".
  // Returns the robots that changed (so the caller can broadcast them).
  checkStale(staleAfterMs = this.staleAfterMs, now = Date.now()) {
    const changed = [];
    for (const r of this.robots.values()) {
      if (r.status !== "offline" && now - r.lastSeen > staleAfterMs) {
        r.status = "offline";
        changed.push(r);
      }
    }
    return changed;
  }

  get(id) {
    return this.robots.get(id) || null;
  }

  // Full current state, as an array (for REST responses and WS snapshots).
  snapshot() {
    return [...this.robots.values()];
  }

  get size() {
    return this.robots.size;
  }
}
