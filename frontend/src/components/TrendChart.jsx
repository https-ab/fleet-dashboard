

import { useEffect, useRef, useState } from "react";
import { WORKING_STATUSES } from "../lib/statuses.js";

const W = 900;
const H = 220;
const PAD = { top: 10, right: 40, bottom: 22, left: 10 };
const MAX_WINDOW_MS = 10 * 60 * 1000; 

const WINDOWS = [
  { label: "30s", ms: 30 * 1000 },
  { label: "2m", ms: 2 * 60 * 1000 },
  { label: "10m", ms: 10 * 60 * 1000 },
];

export default function TrendChart({ robots }) {
  const canvasRef = useRef(null);
  const samplesRef = useRef([]);
  const [windowMs, setWindowMs] = useState(WINDOWS[1].ms); 

  const windowRef = useRef(windowMs);
  windowRef.current = windowMs;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const now = Date.now();
    const t0 = now - windowRef.current;

    // background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // horizontal grid + % labels
    ctx.font = "10px monospace";
    for (const p of [0, 25, 50, 75, 100]) {
      const y = PAD.top + plotH - (p / 100) * plotH;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.fillText(p + "%", W - PAD.right + 6, y + 3);
    }

    // time labels
    ctx.fillText(timeLabel(t0), PAD.left, H - 7);
    ctx.fillText("now", W - PAD.right - 26, H - 7);


    const pts = samplesRef.current.filter((s) => s.t >= t0);
    if (pts.length < 2) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.font = "12px monospace";
      ctx.fillText("collecting data…", PAD.left + 8, H / 2);
      return;
    }
    ctx.beginPath();
    pts.forEach((s, i) => {
      const x = PAD.left + ((s.t - t0) / windowRef.current) * plotW;
      const frac = s.working / Math.max(1, s.total);
      const y = PAD.top + plotH * (1 - frac);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  useEffect(() => {
    const now = Date.now();
    const working = robots.filter((r) =>
      WORKING_STATUSES.has(r.status)
    ).length;
    samplesRef.current.push({ t: now, working, total: robots.length });
    const cutoff = now - MAX_WINDOW_MS;
    samplesRef.current = samplesRef.current.filter((s) => s.t >= cutoff);
    draw();
  }, [robots]);


  useEffect(() => {
    draw();
  }, [windowMs]);

  const latest = samplesRef.current[samplesRef.current.length - 1];
  const pct =
    latest && latest.total > 0
      ? Math.round((latest.working / latest.total) * 100)
      : 0;

  return (
    <div className="border border-slate-800 rounded-lg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h2 className="text-sm font-medium">
            Fleet working{" "}
            <span className="text-slate-500 font-normal">
              (active + on_mission)
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            now <b className="text-green-400">{pct}%</b>
            {latest ? ` — ${latest.working}/${latest.total}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => setWindowMs(w.ms)}
              className={
                "text-xs px-2 py-1 rounded border " +
                (windowMs === w.ms
                  ? "bg-slate-200 text-slate-900 border-slate-200"
                  : "border-slate-700 text-slate-400 hover:border-slate-500")
              }
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full h-auto rounded"
      />
    </div>
  );
}

function timeLabel(t) {
  return new Date(t).toLocaleTimeString([], {
    minute: "2-digit",
    second: "2-digit",
  });
}
