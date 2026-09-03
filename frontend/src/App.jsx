

import { useState } from "react";
import { useFleet } from "./hooks/useFleet.js";
import SiteMap from "./components/Sitemap.jsx";
import RobotDetail from "./components/RobotDetail.jsx";
import TrendChart from "./components/TrendChart.jsx";
import RobotList from "./components/RobotList.jsx";
import AdminControls from "./components/AdminControls.jsx";
import { STATUS_COLORS } from "./lib/statuses.js";

export default function App() {
  const { robots, connected } = useFleet();
  const [selectedId, setSelectedId] = useState(null);
  const counts = countByStatus(robots);
  const online = robots.filter((r) => r.status !== "offline").length;
  const selected = robots.find((r) => r.robot_id === selectedId);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold">Fleet Dashboard</h1>
        <span
          className={
            "text-xs px-2 py-0.5 rounded border " +
            (connected
              ? "bg-green-500/15 text-green-400 border-green-500/40"
              : "bg-red-500/15 text-red-400 border-red-500/40")
          }
        >
          {connected ? "LIVE" : "RECONNECTING…"}
        </span>
      </header>
      <p className="text-sm text-slate-400 mb-4">
        {robots.length} robots reporting
      </p>

      
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(counts).map(([status, n]) => (
          <span
            key={status}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
            style={{ backgroundColor: STATUS_COLORS[status] + "26" }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            {status} <b>{n}</b>
          </span>
        ))}
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section className="lg:col-span-3">
          <SiteMap
            robots={robots}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <RobotDetail
            robot={selected}
            onClose={() => setSelectedId(null)}
          />
        </section>

        <section className="lg:col-span-2 flex flex-col gap-4">
          <TrendChart robots={robots} />
          <RobotList
            robots={robots}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <AdminControls />
        </section>
      </main>
    </div>
  );
}


function countByStatus(robots) {
  const counts = {};
  for (const r of robots) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}
