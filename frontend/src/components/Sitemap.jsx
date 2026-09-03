

import { useEffect, useRef } from "react";
import { STATUS_COLORS } from "../lib/statuses.js";

const SITE_W = 900;
const SITE_H = 560;
const DOT_RADIUS = 4;
const CLICK_RADIUS = 10; 

export default function SiteMap({ robots, selectedId, onSelect }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null); 

  const robotsRef = useRef(robots);
  robotsRef.current = robots;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

   
    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0);
    } else {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, SITE_W, SITE_H);
    }

    
    for (const r of robotsRef.current) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[r.status] || "#ffffff";
      ctx.fill();
    }

    
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
      ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
      ctx.strokeText(sel.robot_id, sel.x + 10, sel.y - 10);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(sel.robot_id, sel.x + 10, sel.y - 10);
    }
  }


  useEffect(() => {
    const img = new Image();
    img.src = "/layout.png";
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
  }, []);


  useEffect(() => {
    draw();
  }, [robots, selectedId]);


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
