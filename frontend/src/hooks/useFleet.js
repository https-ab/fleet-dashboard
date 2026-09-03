

import { useEffect, useRef, useState } from "react";

export function useFleet() {
  const [robots, setRobots] = useState([]);
  const [connected, setConnected] = useState(false);

  const mapRef = useRef(new Map()); 

  useEffect(() => {
    let ws;
    let stopped = false;
    let retryIn = 1000; 
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
        retryIn = 1000; 
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot") applySnapshot(msg.robots);
        else if (msg.type === "update") applyUpdates(msg.robots);
      };

      ws.onerror = () => ws.close();
    }

    connect();

   
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, []);

  return { robots, connected };
}
