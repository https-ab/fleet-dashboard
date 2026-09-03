// useFleet.js
// =====================================================================
// The dashboard's live data connection. One hook:
//   const { robots, connected } = useFleet();
//
// - Opens a WebSocket to the backend (relative url "/ws/robots" — the
//   Vite proxy handles dev, same-origin handles production).
// - On (re)connect the backend sends a full "snapshot" — so a dropped
//   connection heals itself: we just wait for the next snapshot.
// - "update" messages carry only the robots that changed; we merge them
//   into a Map (O(1)) and publish an array to React.
// - On close, reconnect with exponential backoff: 1s, 2s, 4s ... up to
//   10s. A clean connection resets the backoff.
// =====================================================================

import { useEffect, useRef, useState } from "react";

export function useFleet() {
  const [robots, setRobots] = useState([]);
  const [connected, setConnected] = useState(false);
  // The Map is the fast store; React gets an array each time it changes.
  const mapRef = useRef(new Map()); // robot_id -> robot

  useEffect(() => {
    let ws;
    let stopped = false;
    let retryIn = 1000; // current backoff, doubles up to 10s
    let retryTimer;

    function applySnapshot(list) {
      const m = new Map();
      for (const r of list) m.set(r.robot_id, r);
      mapRef.current = m;
      setRobots([...m.values()]);
    }

    function applyUpdates(list) {
      for (const r of list) mapRef.current.set(r.robot_id, r);
      setRobots([...mapRef.current.values()]);
    }

    function connect() {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws/robots`);

      ws.onopen = () => {
        retryIn = 1000; // clean connection — reset backoff
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot") applySnapshot(msg.robots);
        else if (msg.type === "update") applyUpdates(msg.robots);
      };

      // onerror always leads to onclose, so all retry logic lives here.
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          retryTimer = setTimeout(connect, retryIn);
          retryIn = Math.min(retryIn * 2, 10000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // Cleanup when the component unmounts.
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, []);

  return { robots, connected };
}
