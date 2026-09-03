

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


export const WORKING_STATUSES = new Set(["active", "on_mission"]);

export const LOW_BATTERY = 20; 


export function needsAttention(robot) {
  if (!robot) return false;
  if (robot.status === "error" || robot.status === "blocked") return true;
  if (robot.status === "offline") return true; // lost signal
  if (robot.status !== "charging" && robot.battery < LOW_BATTERY) {
    return true; 
  }
  return false;
}


export function attentionReason(robot) {
  if (robot.status === "error") return "in error state";
  if (robot.status === "blocked") return "blocked";
  if (robot.status === "offline") return "no signal";
  if (robot.status !== "charging" && robot.battery < LOW_BATTERY) {
    return `low battery (${Math.round(robot.battery)}%)`;
  }
  return null;
}
