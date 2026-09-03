// AdminControls.jsx
// =====================================================================
// The UI for the LIVE CONTROLS — the assignment requires fleet size
// and update interval to be changeable on the deployed instance
// WITHOUT a redeploy, through a documented, sensibly-protected
// control.
//
// Flow:
//   * on mount, GET /api/config prefills the current values
//   * Apply sends POST /api/config with the x-control-token header
//     (the token is the backend's CONTROL_TOKEN env var; default in
//     dev is "dev-token-change-me")
//   * the backend validates the token (401) and the limits (400),
//     then tells the simulators to apply it — no restart anywhere
//
// Leave a field EMPTY to leave that setting unchanged.
// =====================================================================

import { useEffect, useState } from "react";

export default function AdminControls() {
  const [token, setToken] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [updateIntervalMs, setUpdateIntervalMs] = useState("");
  const [status, setStatus] = useState(null); // { ok, msg }

  // Prefill with the current live config.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setFleetSize(c.fleetSize);
        setUpdateIntervalMs(c.updateIntervalMs);
      })
      .catch(() => {});
  }, []);

  function apply() {
    setStatus(null);
    // Only send fields the operator actually filled in.
    const body = {};
    if (fleetSize !== "") body.fleetSize = Number(fleetSize);
    if (updateIntervalMs !== "") body.updateIntervalMs = Number(updateIntervalMs);

    fetch("/api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-control-token": token,
      },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setFleetSize(data.config.fleetSize);
        setUpdateIntervalMs(data.config.updateIntervalMs);
        setStatus({
          ok: true,
          msg: `applied: ${data.config.fleetSize} robots, every ${data.config.updateIntervalMs}ms`,
        });
      })
      .catch((e) => setStatus({ ok: false, msg: e.message }));
  }

  return (
    <div className="border border-slate-800 rounded-lg p-3">
      <h2 className="text-sm font-medium">Live controls</h2>
      <p className="text-xs text-slate-500 mb-3">
        Changes the running fleet immediately — no redeploy. Leave a
        field empty to keep that setting.
      </p>

      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="control token"
        className="w-full text-xs mb-2 px-2 py-1.5 rounded border border-slate-700 bg-slate-900 placeholder-slate-600 focus:outline-none focus:border-slate-500"
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          fleet
          <input
            type="number"
            min="1"
            max="2000"
            value={fleetSize}
            onChange={(e) => setFleetSize(e.target.value)}
            className="w-16 px-2 py-1 rounded border border-slate-700 bg-slate-900 focus:outline-none focus:border-slate-500"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          every (ms)
          <input
            type="number"
            min="50"
            max="10000"
            step="50"
            value={updateIntervalMs}
            onChange={(e) => setUpdateIntervalMs(e.target.value)}
            className="w-16 px-2 py-1 rounded border border-slate-700 bg-slate-900 focus:outline-none focus:border-slate-500"
          />
        </label>
        <button
          onClick={apply}
          className="text-xs px-3 py-1.5 rounded bg-slate-200 text-slate-900 hover:bg-white"
        >
          Apply
        </button>
      </div>

      {status && (
        <p
          className={
            "text-xs " + (status.ok ? "text-green-400" : "text-red-400")
          }
        >
          {status.msg}
        </p>
      )}
    </div>
  );
}
