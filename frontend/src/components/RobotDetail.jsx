

import {
  STATUS_COLORS,
  attentionReason,
  WORKING_STATUSES,
} from "../lib/statuses.js";
import { Battery } from "./RobotList.jsx";

export default function RobotDetail({ robot, onClose }) {
  if (!robot) {
    return (
      <p className="text-xs text-slate-500 mt-3">
        Click a robot on the map or in the list to see its details here.
      </p>
    );
  }

  const reason = attentionReason(robot);

  const secsAgo = Math.max(
    0,
    Math.round((Date.now() - robot.lastSeen) / 1000)
  );

  return (
    <div className="mt-3 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-semibold">
            {robot.robot_id}
          </span>
          <span className="text-xs text-slate-500">{robot.type || "—"}</span>
          <span
            className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: STATUS_COLORS[robot.status] + "26",
              color: STATUS_COLORS[robot.status],
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[robot.status] }}
            />
            {robot.status}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          close ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Field label="battery">
          <Battery value={robot.battery} />
        </Field>
        <Field label="position">
          ({Math.round(robot.x)}, {Math.round(robot.y)})
        </Field>
        <Field label="last update">{secsAgo}s ago</Field>
        <Field label="working">
          {WORKING_STATUSES.has(robot.status) ? "yes" : "no"}
        </Field>
      </div>

      {reason && (
        <p className="mt-3 text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded px-2 py-1.5">
          needs attention — {reason}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
