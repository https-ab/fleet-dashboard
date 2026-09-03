

import { useState } from "react";
import {
  STATUS_COLORS,
  needsAttention,
  attentionReason,
} from "../lib/statuses.js";

export default function RobotList({ robots, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); 

  const attentionCount = robots.filter(needsAttention).length;
  const visible = robots
    .filter((r) => filter === "all" || needsAttention(r))
    .filter(
      (r) =>
        !query || r.robot_id.toLowerCase().includes(query.toLowerCase())
    )
    .sort(naturalSort);

  return (
    <div className="border border-slate-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">
          Robots{" "}
          <span className="text-slate-500 font-normal">
            ({visible.length}
            {filter === "attention" ? " need attention" : ""})
          </span>
        </h2>
        <div className="flex gap-1">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
          />
          <FilterButton
            active={filter === "attention"}
            onClick={() => setFilter("attention")}
            label={`Needs attention${attentionCount ? ` (${attentionCount})` : ""}`}
            alert={attentionCount > 0}
          />
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="find a robot, e.g. r4"
        className="w-full text-xs mb-2 px-2 py-1.5 rounded border border-slate-700 bg-slate-900 placeholder-slate-600 focus:outline-none focus:border-slate-500"
      />

     
      <div className="overflow-x-auto">
        <div className="min-w-[300px]">
          <div className="grid grid-cols-[3rem_3rem_5.5rem_4.5rem_1fr] gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 px-2 pb-1">
            <span>id</span>
            <span>type</span>
            <span>status</span>
            <span>battery</span>
            <span className="text-right">details</span>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1 space-y-px">
            {visible.map((r) => {
              const reason = attentionReason(r);
              return (
                <button
                  key={r.robot_id}
                  onClick={() => onSelect(r.robot_id)}
                  className={
                    "w-full grid grid-cols-[3rem_3rem_5.5rem_4.5rem_1fr] gap-1.5 items-center text-xs px-2 py-1.5 rounded text-left " +
                    (r.robot_id === selectedId
                      ? "bg-slate-200/15 ring-1 ring-slate-400"
                      : "hover:bg-slate-800/60")
                  }
                >
                  <span className="font-mono">{r.robot_id}</span>
                  <span className="text-slate-500">{r.type || "—"}</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[r.status] }}
                    />
                    {r.status}
                  </span>
                  <Battery value={r.battery} />
                  <span className="text-right text-slate-500 truncate">
                    {reason ? (
                      <b className="text-red-400">{reason}</b>
                    ) : (
                      `x ${Math.round(r.x)}, y ${Math.round(r.y)}`
                    )}
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="text-xs text-slate-600 px-2 py-4">
                No robots match.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, label, alert }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-xs px-2 py-1 rounded border " +
        (active
          ? "bg-slate-200 text-slate-900 border-slate-200"
          : alert
            ? "border-red-500/50 text-red-400 hover:border-red-400"
            : "border-slate-700 text-slate-400 hover:border-slate-500")
      }
    >
      {label}
    </button>
  );
}


export function Battery({ value }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v < 20 ? "#ef4444" : v < 50 ? "#facc15" : "#22c55e";
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-8 h-1.5 rounded bg-slate-800 overflow-hidden">
        <span
          className="block h-full"
          style={{ width: `${v}%`, backgroundColor: color }}
        />
      </span>
      <span className="text-slate-400">{Math.round(v)}%</span>
    </span>
  );
}


function naturalSort(a, b) {
  const na = parseInt(a.robot_id.replace(/\D/g, ""), 10) || 0;
  const nb = parseInt(b.robot_id.replace(/\D/g, ""), 10) || 0;
  return na - nb;
}
