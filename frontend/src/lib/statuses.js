// statuses.js
// =====================================================================
// Shared knowledge about robot statuses — ONE place, used by the map,
// the list, the detail panel, and the chart. Change a colour or a rule
// here and it changes everywhere.
// =====================================================================

// Dot colour per status (used on the map, the list, the chips).
export const STATUS_COLORS = {
  idle: "#94a3b8", // slate — just waiting
  active: "#22c55e", // green — moving/working
  on_mission: "#3b82f6", // blue — has a mission
  charging: "#facc15", // yellow — plugged in
  blocked: "#f97316", // orange — stuck
  error: "#ef4444", // red — broken
  maintenance: "#c084fc", // purple — being serviced
  offline: "#52525b", // dark zinc — no signal
};

// What "working" means for the trend chart.
// A defensible call (the assignment says make one and be ready to defend
// it): a robot is working when it is actively doing something —
// "active" or "on_mission". Idle/blocked/etc. are not working.
export const WORKING_STATUSES = new Set(["active", "on_mission"]);

export const LOW_BATTERY = 20; // % — below this a robot is at risk

// Should the operator look at this robot? (The "needs attention" filter.)
export function needsAttention(robot) {
  if (!robot) return false;
  if (robot.status === "error" || robot.status === "blocked") return true;
  if (robot.status === "offline") return true; // lost signal
  if (robot.status !== "charging" && robot.battery < LOW_BATTERY) {
    return true; // about to die, and not at a charger yet
  }
  return false;
}

// A short human reason, for the list/detail UI. Null if all fine.
export function attentionReason(robot) {
  if (robot.status === "error") return "in error state";
  if (robot.status === "blocked") return "blocked";
  if (robot.status === "offline") return "no signal";
  if (robot.status !== "charging" && robot.battery < LOW_BATTERY) {
    return `low battery (${Math.round(robot.battery)}%)`;
  }
  return null;
}
