// SiteMap.jsx
// =====================================================================
// The site, drawn on a <canvas> — NOT one div per robot.
//
// Why canvas? With 8 robots, absolutely-positioned divs would be fine.
// At 800 robots, React would be re-rendering 800 DOM nodes every tick
// and the tab would crawl. A canvas is ONE element: we repaint the
// whole picture whenever the fleet changes, and painting 1000 dots is
// trivial. This is the direct answer to the assignment's "a dashboard
// that becomes unusable at 800 robots has missed the point".
//
// Coordinates: layout.png is 900x560 and 1 px = 1 unit, so the canvas
// is exactly 900x560 and a robot's (x, y) can be drawn directly — no
// conversion. CSS scales the canvas down for display; onClick scales
// the click back up.
// =====================================================================

import { useEffect, useRef } from "react";
import { STATUS_COLORS } from "../lib/statuses.js";

const SITE_W = 900;
const SITE_H = 560;
const DOT_RADIUS = 4;
const CLICK_RADIUS = 10; // generous — 4px dots are fiddly to click

export default function SiteMap({ robots, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null); // the loaded layout.png

  // draw() is shared by two effects, so it reads the latest props via
  // refs instead of relying on closures.
  const robotsRef = useRef(robots);
  robotsRef.current = robots;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // 1) Background: the site image (a dark rect while it loads)
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0);
    } else {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, SITE_W, SITE_H);
    }

    // 2) One dot per robot, coloured by status
    for (const r of robotsRef.current) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[r.status] || "#ffffff";
      ctx.fill();
    }

    // 3) Selection: a white ring + id label, drawn last so it's on top
    const sel = robotsRef.current.find(
      (r) => r.robot_id === selectedRef.current
    );
    if (sel) {
      ctx.beginPath();
      ctx.arc(sel.x, sel.y, DOT_RADIUS + 4, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      ctx.font = "bold 13px monospace";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2, 6, 23, 0.85)"; // dark outline for legibility
      ctx.strokeText(sel.robot_id, sel.x + 10, sel.y - 10);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(sel.robot_id, sel.x + 10, sel.y - 10);
    }
  }

  // Load the site image once.
  useEffect(() => {
    const img = new Image();
    img.src = "/layout.png";
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
  }, []);

  // Repaint whenever the fleet or the selection changes.
  useEffect(() => {
    draw();
  }, [robots, selectedId]);

  // Click: translate the (scaled) click into site coordinates, pick the
  // nearest robot within CLICK_RADIUS. Empty space deselects.
  function onClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (SITE_W / rect.width);
    const y = (e.clientY - rect.top) * (SITE_H / rect.height);
    const hit = findNearestRobot(robots, x, y, CLICK_RADIUS);
    onSelect(hit ? hit.robot_id : null);
  }

  return (
    <canvas
      ref={canvasRef}
      width={SITE_W}
      height={SITE_H}
      onClick={onClick}
      className="w-full h-auto rounded-lg border border-slate-800 cursor-crosshair"
    />
  );
}

// Pure helper (easy to reason about, easy to test): the closest robot
// within `radius` site units of (x, y), or null if none.
export function findNearestRobot(robots, x, y, radius) {
  let best = null;
  let bestDist = radius;
  for (const r of robots) {
    const d = Math.hypot(r.x - x, r.y - y);
    if (d <= bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}
