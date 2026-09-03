

import { test } from "node:test";
import assert from "node:assert/strict";
import { FleetState } from "./state.js";


function makeState() {
  return new FleetState({
    staleAfterMs: 5000,
    knownTypes: { r1: "picker" },
  });
}

const report = (id, t, x, status = "idle", battery = 50) => ({
  t,
  robot_id: id,
  x,
  y: 10,
  status,
  battery,
});

test("ingest adds a new robot and attaches its type from the roster", () => {
  const s = makeState();
  const { robot, ignored } = s.ingest(report("r1", 1, 10), 1);
  assert.equal(ignored, false);
  assert.equal(robot.type, "picker"); // looked up, not sent by the robot
  assert.equal(s.size, 1);
});

test("a second report UPDATES the same robot (no duplicate)", () => {
  const s = makeState();
  s.ingest(report("r1", 1, 10), 1);
  const { robot } = s.ingest(report("r1", 2, 12, "active"), 1);
  assert.equal(s.size, 1); // still one robot
  assert.equal(robot.x, 12);
  assert.equal(robot.status, "active");
});

test("an OLDER report from the SAME session is ignored (out-of-order guard)", () => {
  const s = makeState();
  s.ingest(report("r1", 5, 10), 1); // we already have t=5
  const { robot, ignored } = s.ingest(report("r1", 3, 999, "error"), 1); // t=3 is a late duplicate
  assert.equal(ignored, true);
  assert.equal(robot.x, 10); // fresher data wins
  assert.equal(robot.status, "idle");
});

test("a report from a NEW session (simulator restart, t back to 0) is accepted", () => {

  const s = makeState();
  s.ingest(report("r1", 50, 10), 1); // old session had t=50
  const { robot, ignored } = s.ingest(report("r1", 0, 20), 2); // new session, t restarted at 0
  assert.equal(ignored, false);
  assert.equal(robot.x, 20);
  assert.equal(robot.t, 0);
});

test("checkStale marks silent robots offline, leaves fresh ones alone", () => {
  const s = makeState();
  s.ingest(report("r1", 1, 1), 1);
  s.ingest(report("r2", 1, 2), 1);

  // simulate: r1 stopped reporting 6s ago; r2 is fresh (just reported)
  s.robots.get("r1").lastSeen = Date.now() - 6000;

  const changed = s.checkStale(5000);
  assert.deepEqual(changed.map((r) => r.robot_id), ["r1"]);
  assert.equal(s.get("r1").status, "offline");
  assert.equal(s.get("r2").status, "idle");
});

test("checkStale does not report the same robot twice", () => {
  const s = makeState();
  s.ingest(report("r1", 1, 1), 1);
  s.robots.get("r1").lastSeen = Date.now() - 6000;

  s.checkStale(5000); // first pass marks it offline
  const changed = s.checkStale(5000); // second pass: nothing new
  assert.equal(changed.length, 0);
});
