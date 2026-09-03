

export class FleetState {
  constructor({ staleAfterMs = 5000, knownTypes = {} } = {}) {
    this.robots = new Map(); // robot_id -> { ...report, type, lastSeen }
    this.staleAfterMs = staleAfterMs;
    
    this.knownTypes = knownTypes;
  }


  ingest(report, session) {
    const prev = this.robots.get(report.robot_id);

    if (prev && prev.session === session) {
  
      if (
        typeof report.t === "number" &&
        typeof prev.t === "number" &&
        report.t < prev.t
      ) {
        return { robot: prev, ignored: true };
      }
    }
 

    const robot = {
      ...report,
      type: prev?.type ?? this.knownTypes[report.robot_id] ?? null,
      lastSeen: Date.now(),
      session,
    };
    this.robots.set(report.robot_id, robot);
    return { robot, ignored: false };
  }

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

  
  snapshot() {
    return [...this.robots.values()];
  }

  get size() {
    return this.robots.size;
  }
}
